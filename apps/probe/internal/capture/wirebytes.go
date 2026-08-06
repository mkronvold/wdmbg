package capture

// WireBytes returns the on-the-wire packet size for bandwidth accounting.
// Prefer original frame Length over snaplen-truncated CaptureLength.
// When both are missing, fall back to a minimal Ethernet frame size.
func WireBytes(captureLength, length int) uint64 {
	if length > 0 {
		return uint64(length)
	}
	if captureLength > 0 {
		return uint64(captureLength)
	}
	return 64
}
