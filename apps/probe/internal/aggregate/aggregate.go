package aggregate

import (
	"fmt"
	"sync"
	"time"
)

type L4 string

const (
	L4TCP   L4 = "tcp"
	L4UDP   L4 = "udp"
	L4ICMP  L4 = "icmp"
	L4Other L4 = "other"
)

// FlowKey identifies a bidirectional conversation endpoint pair as observed.
type FlowKey struct {
	Src     string
	Dst     string
	SrcPort uint16
	DstPort uint16
	L4      L4
	L7      string
}

func (k FlowKey) String() string {
	return fmt.Sprintf("%s|%d|%s|%d|%s|%s", k.Src, k.SrcPort, k.Dst, k.DstPort, k.L4, k.L7)
}

// Counters are directional relative to Src -> Dst.
type Counters struct {
	BytesSrcToDst   uint64
	BytesDstToSrc   uint64
	PacketsSrcToDst uint64
	PacketsDstToSrc uint64
}

type FlowSample struct {
	Src             string `json:"src"`
	Dst             string `json:"dst"`
	SrcPort         uint16 `json:"srcPort"`
	DstPort         uint16 `json:"dstPort"`
	L4              L4     `json:"l4"`
	L7              string `json:"l7,omitempty"`
	BytesSrcToDst   uint64 `json:"bytesSrcToDst"`
	BytesDstToSrc   uint64 `json:"bytesDstToSrc"`
	PacketsSrcToDst uint64 `json:"packetsSrcToDst"`
	PacketsDstToSrc uint64 `json:"packetsDstToSrc"`
}

type Bucket struct {
	T     int64        `json:"t"`
	Flows []FlowSample `json:"flows"`
}

// SecondAggregator aggregates packets into 1-second bidirectional flow buckets.
type SecondAggregator struct {
	mu      sync.Mutex
	current int64
	flows   map[string]*flowState
}

type flowState struct {
	key FlowKey
	Counters
}

func NewSecondAggregator() *SecondAggregator {
	return &SecondAggregator{
		flows: make(map[string]*flowState),
	}
}

// Observe records a unidirectional packet from src->dst.
// When the packet belongs to a newer second than the open bucket, the previous
// second is closed and returned so callers never drop boundary traffic.
func (a *SecondAggregator) Observe(ts time.Time, src, dst string, srcPort, dstPort uint16, l4 L4, l7 string, bytes uint64) []Bucket {
	if bytes == 0 {
		return nil
	}
	sec := ts.Unix()
	a.mu.Lock()
	defer a.mu.Unlock()
	var closed []Bucket
	if a.current == 0 {
		a.current = sec
	}
	// Drop packets for older seconds; caller should Flush on tick.
	if sec < a.current {
		return nil
	}
	if sec > a.current {
		if len(a.flows) > 0 {
			closed = []Bucket{a.snapshotLocked()}
			a.flows = make(map[string]*flowState)
		}
		a.current = sec
	}
	key, dirForward := canonicalize(src, dst, srcPort, dstPort, l4, l7)
	id := key.String()
	st, ok := a.flows[id]
	if !ok {
		st = &flowState{key: key}
		a.flows[id] = st
	}
	if dirForward {
		st.BytesSrcToDst += bytes
		st.PacketsSrcToDst++
	} else {
		st.BytesDstToSrc += bytes
		st.PacketsDstToSrc++
	}
	return closed
}

func canonicalize(src, dst string, srcPort, dstPort uint16, l4 L4, l7 string) (FlowKey, bool) {
	// Keep observation orientation as Src/Dst of first packet of the flow key:
	// lower endpoint string wins as Src for stable keys when ports equal-ish —
	// MVP: first-seen orientation via map key using sorted endpoints for L4 sessions.
	if src < dst || (src == dst && srcPort <= dstPort) {
		return FlowKey{Src: src, Dst: dst, SrcPort: srcPort, DstPort: dstPort, L4: l4, L7: l7}, true
	}
	return FlowKey{Src: dst, Dst: src, SrcPort: dstPort, DstPort: srcPort, L4: l4, L7: l7}, false
}

// FlushClosed returns completed buckets for seconds < nowSec and advances.
func (a *SecondAggregator) FlushClosed(nowSec int64) []Bucket {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.current == 0 || nowSec <= a.current {
		return nil
	}
	out := []Bucket{a.snapshotLocked()}
	a.flows = make(map[string]*flowState)
	a.current = nowSec
	return out
}

// ForceFlush emits the current second even if still open (used on shutdown / test).
func (a *SecondAggregator) ForceFlush() []Bucket {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.current == 0 || len(a.flows) == 0 {
		return nil
	}
	out := []Bucket{a.snapshotLocked()}
	a.flows = make(map[string]*flowState)
	return out
}

func (a *SecondAggregator) snapshotLocked() Bucket {
	flows := make([]FlowSample, 0, len(a.flows))
	for _, st := range a.flows {
		s := FlowSample{
			Src:             st.key.Src,
			Dst:             st.key.Dst,
			SrcPort:         st.key.SrcPort,
			DstPort:         st.key.DstPort,
			L4:              st.key.L4,
			BytesSrcToDst:   st.BytesSrcToDst,
			BytesDstToSrc:   st.BytesDstToSrc,
			PacketsSrcToDst: st.PacketsSrcToDst,
			PacketsDstToSrc: st.PacketsDstToSrc,
		}
		if st.key.L7 != "" {
			s.L7 = st.key.L7
		}
		flows = append(flows, s)
	}
	return Bucket{T: a.current, Flows: flows}
}

// GuessL7 maps common ports to coarse application labels (nDPI deferred).
func GuessL7(port uint16, l4 L4) string {
	switch port {
	case 53:
		return "dns"
	case 80:
		return "http"
	case 443:
		return "https"
	case 22:
		return "ssh"
	case 123:
		return "ntp"
	case 25, 465, 587:
		return "smtp"
	case 993, 995, 143, 110:
		return "mail"
	case 8080:
		return "http-alt"
	default:
		if l4 == L4ICMP {
			return "icmp"
		}
		return ""
	}
}