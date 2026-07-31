package export

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/mkronvold/wdmbg/apps/probe/internal/aggregate"
)

func TestPostBucketsSuccess(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if r.Method != http.MethodPost {
			t.Fatalf("method %s", r.Method)
		}
		b, _ := io.ReadAll(r.Body)
		var env Envelope
		if err := json.Unmarshal(b, &env); err != nil {
			t.Fatal(err)
		}
		if env.ProbeID != "p1" || env.IntervalSec != 1 || len(env.Buckets) != 1 {
			t.Fatalf("bad envelope: %+v", env)
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "p1")
	err := c.PostBuckets(context.Background(), []aggregate.Bucket{{
		T: time.Now().Unix(),
		Flows: []aggregate.FlowSample{{
			Src: "10.0.0.1", Dst: "1.1.1.1", SrcPort: 1, DstPort: 443,
			L4: aggregate.L4TCP, L7: "https", BytesSrcToDst: 1, BytesDstToSrc: 2,
		}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if hits.Load() != 1 {
		t.Fatalf("hits=%d", hits.Load())
	}
}

func TestPostBucketsBackoff(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := hits.Add(1)
		if n < 3 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "p1")
	c.HTTPClient.Timeout = 2 * time.Second
	c.MaxRetries = 5
	err := c.PostBuckets(context.Background(), []aggregate.Bucket{{
		T: 1, Flows: []aggregate.FlowSample{{Src: "a", Dst: "b", L4: aggregate.L4Other, BytesSrcToDst: 1}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if hits.Load() < 3 {
		t.Fatalf("expected retries, hits=%d", hits.Load())
	}
}