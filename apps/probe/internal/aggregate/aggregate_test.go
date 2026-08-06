package aggregate

import (
	"testing"
	"time"
)

func TestBidirectionalAggregation(t *testing.T) {
	a := NewSecondAggregator()
	ts := time.Unix(1_800_000_000, 0)
	if closed := a.Observe(ts, "10.0.0.10", "1.1.1.1", 40000, 443, L4TCP, "https", 100); len(closed) != 0 {
		t.Fatalf("unexpected closed on first packet: %+v", closed)
	}
	if closed := a.Observe(ts, "1.1.1.1", "10.0.0.10", 443, 40000, L4TCP, "https", 900); len(closed) != 0 {
		t.Fatalf("unexpected closed on same-second packet: %+v", closed)
	}
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

func TestObserveClosesPreviousSecondWithoutDropping(t *testing.T) {
	a := NewSecondAggregator()
	t0 := time.Unix(100, 0)
	t1 := time.Unix(101, 0)
	a.Observe(t0, "10.0.0.1", "8.8.8.8", 1, 53, L4UDP, "dns", 40)
	// Packet in the next second must emit second 100 and keep second 101 bytes.
	closed := a.Observe(t1, "10.0.0.1", "8.8.8.8", 1, 53, L4UDP, "dns", 80)
	if len(closed) != 1 || closed[0].T != 100 {
		t.Fatalf("expected closed bucket t=100, got %+v", closed)
	}
	if len(closed[0].Flows) != 1 || closed[0].Flows[0].BytesSrcToDst+closed[0].Flows[0].BytesDstToSrc != 40 {
		t.Fatalf("closed bucket bytes wrong: %+v", closed[0])
	}
	open := a.ForceFlush()
	if len(open) != 1 || open[0].T != 101 {
		t.Fatalf("expected open bucket t=101, got %+v", open)
	}
	total := open[0].Flows[0].BytesSrcToDst + open[0].Flows[0].BytesDstToSrc
	if total != 80 {
		t.Fatalf("expected 80 bytes in new second, got %d", total)
	}
}

func TestGuessL7(t *testing.T) {
	if GuessL7(443, L4TCP) != "https" {
		t.Fatal("expected https")
	}
}