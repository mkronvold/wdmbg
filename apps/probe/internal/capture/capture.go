package capture

import (
	"context"
	"time"

	"github.com/mkronvold/wdmbg/apps/probe/internal/aggregate"
)

// Packet is a minimal L3/L4 observation.
type Packet struct {
	Ts      time.Time
	Src     string
	Dst     string
	SrcPort uint16
	DstPort uint16
	L4      aggregate.L4
	Bytes   uint64
}

// Source yields packets until ctx is cancelled.
type Source interface {
	Run(ctx context.Context, out chan<- Packet) error
}