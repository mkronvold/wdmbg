package capture

import (
	"context"
	"time"

	"github.com/mkronvold/wdmbg/apps/probe/internal/aggregate"
)

// SimulateSource emits deterministic fake LAN traffic for tests and dry-runs.
type SimulateSource struct {
	Interval time.Duration
}

func (s *SimulateSource) Run(ctx context.Context, out chan<- Packet) error {
	interval := s.Interval
	if interval <= 0 {
		interval = 200 * time.Millisecond
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	hosts := []string{"10.0.0.10", "10.0.0.20", "10.0.0.30"}
	remotes := []struct {
		ip   string
		port uint16
		l7   string
	}{
		{"1.1.1.1", 443, "https"},
		{"8.8.8.8", 53, "dns"},
		{"9.9.9.9", 443, "https"},
	}
	i := 0
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case ts := <-ticker.C:
			h := hosts[i%len(hosts)]
			r := remotes[i%len(remotes)]
			srcPort := uint16(40000 + (i % 1000))
			// outbound
			select {
			case out <- Packet{Ts: ts, Src: h, Dst: r.ip, SrcPort: srcPort, DstPort: r.port, L4: aggregate.L4TCP, Bytes: 200 + uint64(i%50)}:
			case <-ctx.Done():
				return ctx.Err()
			}
			// inbound reply
			select {
			case out <- Packet{Ts: ts, Src: r.ip, Dst: h, SrcPort: r.port, DstPort: srcPort, L4: aggregate.L4TCP, Bytes: 800 + uint64(i%100)}:
			case <-ctx.Done():
				return ctx.Err()
			}
			i++
		}
	}
}