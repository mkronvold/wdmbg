package aggregate

import (
	"testing"
	"time"
)

func TestBidirectionalAggregation(t *testing.T) {
	a := NewSecondAggregator()
	ts := time.Unix(1_800_000_000, 0)
	a.Observe(ts, "10.0.0.10", "1.1.1.1", 40000, 443, L4TCP, "https", 100)
	a.Observe(ts, "1.1.1.1", "10.0.0.10", 443, 40000, L4TCP, "https", 900)
	buckets := a.ForceFlush()
	if len(buckets) != 1 {
		t.Fatalf("expected 1 bucket, got %d", len(buckets))
	}
	if len(buckets[0].Flows) != 1 {
		t.Fatalf("expected 1 flow, got %d", len(buckets[0].Flows))
	}
	f := buckets[0].Flows[0]
	total := f.BytesSrcToDst + f.BytesDstToSrc
	if total != 1000 {
		t.Fatalf("expected 1000 bytes total, got %d (fwd=%d rev=%d)", total, f.BytesSrcToDst, f.BytesDstToSrc)
	}
	if f.PacketsSrcToDst+f.PacketsDstToSrc != 2 {
		t.Fatalf("expected 2 packets")
	}
}

func TestFlushClosed(t *testing.T) {
	a := NewSecondAggregator()
	ts := time.Unix(100, 0)
	a.Observe(ts, "10.0.0.1", "8.8.8.8", 1, 53, L4UDP, "dns", 40)
	got := a.FlushClosed(101)
	if len(got) != 1 || got[0].T != 100 {
		t.Fatalf("unexpected flush: %+v", got)
	}
}

func TestGuessL7(t *testing.T) {
	if GuessL7(443, L4TCP) != "https" {
		t.Fatal("expected https")
	}
}