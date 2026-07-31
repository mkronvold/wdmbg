package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/mkronvold/wdmbg/apps/probe/internal/aggregate"
	"github.com/mkronvold/wdmbg/apps/probe/internal/capture"
	"github.com/mkronvold/wdmbg/apps/probe/internal/export"
)

const version = "0.1.0"

func main() {
	var (
		showVersion = flag.Bool("version", false, "print version and exit")
		showHelp    = flag.Bool("help", false, "print help and exit")
		iface       = flag.String("iface", envOr("WDMBG_CAPTURE_IFACE", "vmbr0"), "capture interface")
		ingestURL   = flag.String("ingest-url", envOr("WDMBG_API_INGEST_URL", "http://wdmbg.lan/api/ingest/rollups"), "ingest URL")
		probeID     = flag.String("probe-id", envOr("WDMBG_PROBE_ID", "probe-1"), "probe identifier")
		snaplen     = flag.Int("snaplen", envInt("WDMBG_SNAPLEN", 128), "pcap snaplen")
		interval    = flag.Int("interval", envInt("WDMBG_BATCH_INTERVAL_SEC", 1), "flush interval seconds")
		simulate    = flag.Bool("simulate", envBool("WDMBG_SIMULATE", false), "emit simulated traffic instead of pcap")
		once        = flag.Bool("once", false, "run one simulate batch and exit (tests)")
	)
	flag.Parse()

	if *showHelp || (flag.NArg() == 1 && flag.Arg(0) == "help") {
		printHelp()
		return
	}
	if *showVersion || (flag.NArg() == 1 && flag.Arg(0) == "version") {
		fmt.Printf("wdmbg-probe %s\n", version)
		return
	}

	if *interval < 1 {
		*interval = 1
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	agg := aggregate.NewSecondAggregator()
	client := export.NewClient(*ingestURL, *probeID)

	var src capture.Source
	if *simulate || *once {
		src = &capture.SimulateSource{Interval: 100 * time.Millisecond}
		fmt.Fprintf(os.Stderr, "wdmbg-probe %s simulate → %s\n", version, *ingestURL)
	} else {
		src = &capture.PcapSource{Iface: *iface, Snaplen: int32(*snaplen), Promisc: true}
		fmt.Fprintf(os.Stderr, "wdmbg-probe %s capture %s → %s\n", version, *iface, *ingestURL)
	}

	packets := make(chan capture.Packet, 4096)
	errCh := make(chan error, 1)
	go func() {
		errCh <- src.Run(ctx, packets)
	}()

	flushEvery := time.Duration(*interval) * time.Second
	ticker := time.NewTicker(flushEvery)
	defer ticker.Stop()

	pending := make([]aggregate.Bucket, 0, 8)
	flush := func() {
		now := time.Now().Unix()
		closed := agg.FlushClosed(now)
		pending = append(pending, closed...)
		if len(pending) == 0 {
			return
		}
		if err := client.PostBuckets(ctx, pending); err != nil {
			fmt.Fprintf(os.Stderr, "ingest error: %v\n", err)
			return
		}
		pending = pending[:0]
	}

	if *once {
		deadline := time.After(1500 * time.Millisecond)
		for {
			select {
			case <-deadline:
				pending = append(pending, agg.ForceFlush()...)
				if err := client.PostBuckets(context.Background(), pending); err != nil {
					fmt.Fprintf(os.Stderr, "ingest error: %v\n", err)
					os.Exit(1)
				}
				fmt.Println("simulate once complete")
				return
			case pkt := <-packets:
				handlePacket(agg, pkt)
			case err := <-errCh:
				if err != nil && ctx.Err() == nil {
					fmt.Fprintf(os.Stderr, "capture error: %v\n", err)
					os.Exit(1)
				}
			}
		}
	}

	for {
		select {
		case <-ctx.Done():
			pending = append(pending, agg.ForceFlush()...)
			_ = client.PostBuckets(context.Background(), pending)
			return
		case err := <-errCh:
			if err != nil && ctx.Err() == nil {
				fmt.Fprintf(os.Stderr, "capture error: %v\n", err)
				os.Exit(1)
			}
		case pkt := <-packets:
			handlePacket(agg, pkt)
		case <-ticker.C:
			flush()
		}
	}
}

func handlePacket(agg *aggregate.SecondAggregator, pkt capture.Packet) {
	l7 := aggregate.GuessL7(pkt.DstPort, pkt.L4)
	if l7 == "" {
		l7 = aggregate.GuessL7(pkt.SrcPort, pkt.L4)
	}
	agg.Observe(pkt.Ts, pkt.Src, pkt.Dst, pkt.SrcPort, pkt.DstPort, pkt.L4, l7, pkt.Bytes)
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	var n int
	_, err := fmt.Sscanf(v, "%d", &n)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func envBool(key string, fallback bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	switch v {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func printHelp() {
	fmt.Print(`wdmbg-probe — WDMBG host probe

Usage:
  wdmbg-probe [flags]

Flags:
  -version         Print version and exit
  -help            Print this help and exit
  -iface           Capture interface (env WDMBG_CAPTURE_IFACE, default vmbr0)
  -ingest-url      POST target (env WDMBG_API_INGEST_URL)
  -probe-id        Probe id (env WDMBG_PROBE_ID)
  -snaplen         pcap snaplen (env WDMBG_SNAPLEN, default 128)
  -interval        Flush interval seconds (env WDMBG_BATCH_INTERVAL_SEC, default 1)
  -simulate        Generate fake traffic (no pcap)
  -once            Simulate briefly and exit

Linux capture uses libpcap via gopacket (requires libpcap and CAP_NET_RAW).
Non-Linux builds support -simulate only.

Deploy: host-native binary + systemd on proxbox1 — see docs/PROBE.md
`)
}