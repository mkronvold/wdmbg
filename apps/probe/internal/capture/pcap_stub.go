//go:build !linux

package capture

import (
	"context"
	"fmt"
)

// PcapSource is unavailable on non-Linux builds.
type PcapSource struct {
	Iface   string
	Snaplen int32
	Promisc bool
}

func (p *PcapSource) Run(ctx context.Context, out chan<- Packet) error {
	return fmt.Errorf("pcap capture is only supported on linux (use -simulate on this platform)")
}