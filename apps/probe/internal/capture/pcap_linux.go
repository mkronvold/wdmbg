//go:build linux

package capture

import (
	"context"
	"fmt"
	"time"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
	"github.com/mkronvold/wdmbg/apps/probe/internal/aggregate"
)

// PcapSource captures using libpcap/AF_PACKET via gopacket.
type PcapSource struct {
	Iface   string
	Snaplen int32
	Promisc bool
}

func (p *PcapSource) Run(ctx context.Context, out chan<- Packet) error {
	if p.Iface == "" {
		return fmt.Errorf("capture iface required")
	}
	snap := p.Snaplen
	if snap <= 0 {
		snap = 128
	}
	handle, err := pcap.OpenLive(p.Iface, snap, p.Promisc, 500*time.Millisecond)
	if err != nil {
		return fmt.Errorf("pcap open %s: %w", p.Iface, err)
	}
	defer handle.Close()

	src := gopacket.NewPacketSource(handle, handle.LinkType())
	packets := src.Packets()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case pkt, ok := <-packets:
			if !ok {
				return nil
			}
			if parsed, ok := parsePacket(pkt); ok {
				select {
				case out <- parsed:
				case <-ctx.Done():
					return ctx.Err()
				}
			}
		}
	}
}

func parsePacket(pkt gopacket.Packet) (Packet, bool) {
	meta := pkt.Metadata()
	ts := time.Now()
	if meta != nil {
		ts = meta.Timestamp
		if ts.IsZero() {
			ts = time.Now()
		}
	}
	length := uint64(0)
	if meta != nil && meta.CaptureLength > 0 {
		length = uint64(meta.CaptureLength)
	} else if meta != nil {
		length = uint64(meta.Length)
	}

	var src, dst string
	if ip4 := pkt.Layer(layers.LayerTypeIPv4); ip4 != nil {
		v := ip4.(*layers.IPv4)
		src = v.SrcIP.String()
		dst = v.DstIP.String()
	} else if ip6 := pkt.Layer(layers.LayerTypeIPv6); ip6 != nil {
		v := ip6.(*layers.IPv6)
		src = v.SrcIP.String()
		dst = v.DstIP.String()
	} else {
		return Packet{}, false
	}

	var srcPort, dstPort uint16
	l4 := aggregate.L4Other
	if tcpL := pkt.Layer(layers.LayerTypeTCP); tcpL != nil {
		t := tcpL.(*layers.TCP)
		srcPort = uint16(t.SrcPort)
		dstPort = uint16(t.DstPort)
		l4 = aggregate.L4TCP
	} else if udpL := pkt.Layer(layers.LayerTypeUDP); udpL != nil {
		u := udpL.(*layers.UDP)
		srcPort = uint16(u.SrcPort)
		dstPort = uint16(u.DstPort)
		l4 = aggregate.L4UDP
	} else if pkt.Layer(layers.LayerTypeICMPv4) != nil || pkt.Layer(layers.LayerTypeICMPv6) != nil {
		l4 = aggregate.L4ICMP
	}

	if length == 0 {
		length = 64
	}
	return Packet{
		Ts:      ts,
		Src:     src,
		Dst:     dst,
		SrcPort: srcPort,
		DstPort: dstPort,
		L4:      l4,
		Bytes:   length,
	}, true
}