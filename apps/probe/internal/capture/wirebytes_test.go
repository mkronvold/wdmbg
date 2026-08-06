package capture

import "testing"

func TestWireBytesPrefersOriginalLength(t *testing.T) {
	// Bulk TCP with snaplen 128 must count full wire size, not capture slice.
	if got := WireBytes(128, 1514); got != 1514 {
		t.Fatalf("WireBytes(128, 1514) = %d, want 1514", got)
	}
	if got := WireBytes(128, 1500); got != 1500 {
		t.Fatalf("WireBytes(128, 1500) = %d, want 1500", got)
	}
}

func TestWireBytesFallsBackToCaptureLength(t *testing.T) {
	if got := WireBytes(128, 0); got != 128 {
		t.Fatalf("WireBytes(128, 0) = %d, want 128", got)
	}
}

func TestWireBytesMinimalFallback(t *testing.T) {
	if got := WireBytes(0, 0); got != 64 {
		t.Fatalf("WireBytes(0, 0) = %d, want 64", got)
	}
}

func TestWireBytesScaleFactorSnaplenBug(t *testing.T) {
	// Documents the pre-fix undercount: snaplen 128 vs ~1500B frames ≈ 11.8×.
	const snaplen = 128
	const wire = 1514
	ratio := float64(wire) / float64(snaplen)
	if ratio < 11 || ratio > 12 {
		t.Fatalf("unexpected ratio %.2f", ratio)
	}
	// 300 Mbps counted with snaplen would appear ≈ 25 Mbps before other loss.
	apparent := 300.0 * float64(snaplen) / float64(wire)
	if apparent < 24 || apparent > 26 {
		t.Fatalf("apparent Mbps %.2f", apparent)
	}
	if got := WireBytes(snaplen, wire); got != wire {
		t.Fatalf("fixed path still wrong: %d", got)
	}
}
