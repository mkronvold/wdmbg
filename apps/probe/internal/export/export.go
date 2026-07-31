package export

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/mkronvold/wdmbg/apps/probe/internal/aggregate"
)

type Envelope struct {
	ProbeID     string             `json:"probeId"`
	SentAt      string             `json:"sentAt"`
	IntervalSec int                `json:"intervalSec"`
	Buckets     []aggregate.Bucket `json:"buckets"`
}

type Client struct {
	URL        string
	ProbeID    string
	HTTPClient *http.Client
	MaxRetries int
}

func NewClient(url, probeID string) *Client {
	return &Client{
		URL:     url,
		ProbeID: probeID,
		HTTPClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		MaxRetries: 5,
	}
}

func (c *Client) PostBuckets(ctx context.Context, buckets []aggregate.Bucket) error {
	if len(buckets) == 0 {
		return nil
	}
	env := Envelope{
		ProbeID:     c.ProbeID,
		SentAt:      time.Now().UTC().Format(time.RFC3339Nano),
		IntervalSec: 1,
		Buckets:     buckets,
	}
	body, err := json.Marshal(env)
	if err != nil {
		return err
	}

	var lastErr error
	backoff := 500 * time.Millisecond
	for attempt := 0; attempt <= c.MaxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
			if backoff < 8*time.Second {
				backoff *= 2
			}
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil
		}
		lastErr = fmt.Errorf("ingest status %d", resp.StatusCode)
		if resp.StatusCode >= 400 && resp.StatusCode < 500 && resp.StatusCode != 429 {
			return lastErr
		}
	}
	return lastErr
}