package kvtube

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestStripKeepAliveFromURLPreservesSignedEncoding(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "middle param removed preserving %2C and %3D",
			in:   "/api/invidious/companion/videoplayback?expire=1795175742&keepalive=yes&sparams=expire%2Cei%2Cip&sig=abc%3D%3D&pot=xyz%2B1",
			want: "/api/invidious/companion/videoplayback?expire=1795175742&sparams=expire%2Cei%2Cip&sig=abc%3D%3D&pot=xyz%2B1",
		},
		{
			name: "first param removed",
			in:   "https://yt.example.com/videoplayback?keepalive=yes&itag=137&sig=123%3D%3D",
			want: "https://yt.example.com/videoplayback?itag=137&sig=123%3D%3D",
		},
		{
			name: "only param removed leaves clean path",
			in:   "/companion/videoplayback?keepalive=yes",
			want: "/companion/videoplayback",
		},
		{
			name: "no keepalive unchanged",
			in:   "/api/invidious/companion/videoplayback?itag=18&ratebypass=yes&sig=abc%3D",
			want: "/api/invidious/companion/videoplayback?itag=18&ratebypass=yes&sig=abc%3D",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := stripKeepAliveFromURL(tc.in)
			if got != tc.want {
				t.Fatalf("stripKeepAliveFromURL(%q)\n got: %q\nwant: %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestBuildUpstreamTargetStripsKeepAlive(t *testing.T) {
	svc := NewService("https://kvt.example.com", "https://kvt.example.com/api/invidious")
	rawQuery := "expire=1795175742&keepalive=yes&sparams=expire%2Cei&sig=abc%3D%3D&host=rr3---sn-test.googlevideo.com"
	got := svc.buildUpstreamTarget("/companion/videoplayback", rawQuery)

	if strings.Contains(got, "keepalive") {
		t.Fatalf("expected keepalive stripped, got: %s", got)
	}
	if !strings.Contains(got, "sig=abc%3D%3D") {
		t.Fatalf("expected percent encoding of sig preserved, got: %s", got)
	}
	if !strings.Contains(got, "sparams=expire%2Cei") {
		t.Fatalf("expected percent encoding of sparams preserved, got: %s", got)
	}
	wantPrefix := "https://kvt.example.com/companion/videoplayback?"
	if !strings.HasPrefix(got, wantPrefix) {
		t.Fatalf("expected prefix %q, got %q", wantPrefix, got)
	}
}

func TestRewriteMPDManifestStripsKeepAliveAndKeepsXMLEntities(t *testing.T) {
	svc := NewService("https://yt.khoavo.vndns.net", "https://yt.khoavo.vndns.net/api/invidious")
	mpd := `<?xml version="1.0" encoding="utf-8"?><MPD><Period><AdaptationSet id="0"><Representation id="137"><BaseURL>https://yt.khoavo.vndns.net/companion/videoplayback?expire=1795175742&amp;itag=137&amp;keepalive=yes&amp;sparams=expire%2Cei&amp;sig=abc%3D%3D&amp;host=rr3.googlevideo.com</BaseURL></Representation><Representation id="140"><BaseURL>/api/invidious/companion/videoplayback?expire=1795175742&amp;keepalive=yes&amp;sig=xyz%3D%3D</BaseURL></Representation></AdaptationSet></Period></MPD>`

	out := string(svc.rewriteMPDManifest([]byte(mpd)))
	if strings.Contains(out, "keepalive") {
		t.Fatalf("expected keepalive stripped from MPD BaseURLs, got:\n%s", out)
	}
	if strings.Contains(out, "&amp;amp;") {
		t.Fatalf("expected no double-escaped XML ampersands, got:\n%s", out)
	}
	if !strings.Contains(out, "<BaseURL>/api/invidious/companion/videoplayback?expire=1795175742&amp;itag=137&amp;sparams=expire%2Cei&amp;sig=abc%3D%3D&amp;host=rr3.googlevideo.com</BaseURL>") {
		t.Fatalf("expected rewritten Rep 137 BaseURL with XML entities and intact encoding, got:\n%s", out)
	}
	if !strings.Contains(out, "<BaseURL>/api/invidious/companion/videoplayback?expire=1795175742&amp;sig=xyz%3D%3D</BaseURL>") {
		t.Fatalf("expected rewritten Rep 140 BaseURL with XML entities, got:\n%s", out)
	}
}

func TestExtractVideoPlaybackFallbackHosts(t *testing.T) {
	u := "/companion/videoplayback?expire=1795194238&ei=abc&mn=sn-u1woc5-5f%2Csn-ojq4f5-cp&fvip=2&sparams=expire%2Cei&sig=xyz%3D%3D&host=rr4---sn-u1woc5-5f.googlevideo.com"
	primary, fallbacks := extractVideoPlaybackFallbackHosts(u)
	if primary != "rr4---sn-u1woc5-5f.googlevideo.com" {
		t.Fatalf("unexpected primary host: %q", primary)
	}
	want := []string{
		"rr2---sn-ojq4f5-cp.googlevideo.com",
		"rr1---sn-ojq4f5-cp.googlevideo.com",
		"rr1---sn-u1woc5-5f.googlevideo.com",
		"rr2---sn-u1woc5-5f.googlevideo.com",
	}
	if !reflect.DeepEqual(fallbacks, want) {
		t.Fatalf("fallbacks mismatch:\n got: %v\nwant: %v", fallbacks, want)
	}

	// Deduplication when primary already matches rr1---mn[0] and fvip is 1
	uSame := "/companion/videoplayback?mn=sn-woc7kn7r%2Csn-q4flrnez&fvip=1&host=rr1---sn-woc7kn7r.googlevideo.com"
	primary2, fb2 := extractVideoPlaybackFallbackHosts(uSame)
	if primary2 != "rr1---sn-woc7kn7r.googlevideo.com" {
		t.Fatalf("unexpected primary2: %q", primary2)
	}
	want2 := []string{"rr1---sn-q4flrnez.googlevideo.com"}
	if !reflect.DeepEqual(fb2, want2) {
		t.Fatalf("fallbacks2 mismatch:\n got: %v\nwant: %v", fb2, want2)
	}

	// Non-googlevideo or invalid mn returns empty fallbacks
	_, fbInvalid := extractVideoPlaybackFallbackHosts("/companion/videoplayback?mn=bad/host&fvip=99&host=example.com")
	if len(fbInvalid) != 0 {
		t.Fatalf("expected zero fallbacks for non-googlevideo host, got: %v", fbInvalid)
	}
}

func TestReplaceHostQueryParamPreservesEncoding(t *testing.T) {
	in := "https://kvt.example.com/companion/videoplayback?expire=1795&sparams=expire%2Cei%2Cip&sig=ab%3D%3D&pot=x%2B1&host=rr4---sn-u1woc5-5f.googlevideo.com&cver=1.0"
	got := replaceHostQueryParam(in, "rr2---sn-ojq4f5-cp.googlevideo.com")
	want := "https://kvt.example.com/companion/videoplayback?expire=1795&sparams=expire%2Cei%2Cip&sig=ab%3D%3D&pot=x%2B1&host=rr2---sn-ojq4f5-cp.googlevideo.com&cver=1.0"
	if got != want {
		t.Fatalf("replaceHostQueryParam mismatch:\n got: %s\nwant: %s", got, want)
	}
}

func TestIsPrivateOrLocalHost(t *testing.T) {
	trueHosts := []string{
		"127.0.0.1:29083",
		"localhost:8282",
		"192.168.1.52:3241",
		"10.0.0.5:8080",
		"172.18.0.4:3000",
		"companion:8282",
		"invidious.local:3000",
		"api.internal",
		"[::1]:8090",
	}
	for _, h := range trueHosts {
		if !isPrivateOrLocalHost(h) {
			t.Errorf("expected isPrivateOrLocalHost(%q) == true", h)
		}
	}
	falseHosts := []string{
		"u.khoavo.vndns.net",
		"i.ytimg.com:443",
		"8.8.8.8:443",
		"invidious.example.com",
	}
	for _, h := range falseHosts {
		if isPrivateOrLocalHost(h) {
			t.Errorf("expected isPrivateOrLocalHost(%q) == false", h)
		}
	}
}

func TestDoRequestSkipsWarpForUpstreamAndPrivateHosts(t *testing.T) {
	var proxyHits atomic.Int32
	fakeWarp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxyHits.Add(1)
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer fakeWarp.Close()

	var upstreamHits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := upstreamHits.Add(1)
		if n == 1 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer upstream.Close()

	t.Setenv("WARP_PROXY", fakeWarp.URL)
	t.Setenv("WARP_FORCE", "")
	svc := NewService(upstream.URL, upstream.URL+"/api/invidious")

	req, err := http.NewRequest(http.MethodGet, upstream.URL+"/health", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := svc.doRequest(req, false, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 after direct retry, got %d", resp.StatusCode)
	}
	if proxyHits.Load() != 0 {
		t.Fatalf("expected 0 hits to WARP proxy for local/upstream host, got %d", proxyHits.Load())
	}
}

func TestProxyInvidiousHedgedHostFailover(t *testing.T) {
	var badHits atomic.Int32
	var goodHits atomic.Int32

	mockUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hostParam := r.URL.Query().Get("host")
		if hostParam == "rr4---sn-bad.googlevideo.com" {
			badHits.Add(1)
			select {
			case <-time.After(4 * time.Second):
				w.WriteHeader(http.StatusGatewayTimeout)
			case <-r.Context().Done():
			}
			return
		}
		if hostParam == "rr2---sn-good.googlevideo.com" {
			goodHits.Add(1)
			w.Header().Set("Content-Type", "video/mp4")
			w.Header().Set("Content-Range", "bytes 0-11/100")
			w.WriteHeader(http.StatusPartialContent)
			_, _ = w.Write([]byte("MP4-CHUNK-OK"))
			return
		}
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer mockUpstream.Close()

	t.Setenv("WARP_PROXY", "off")
	svc := NewService(mockUpstream.URL, mockUpstream.URL+"/api/invidious")
	svc.hedgeDelay = 60 * time.Millisecond

	mediaPath := "/api/invidious/companion/videoplayback?expire=1795&mn=sn-bad%2Csn-good&fvip=2&sparams=expire&sig=ok%3D%3D&host=rr4---sn-bad.googlevideo.com"

	// Request 1: primary stalls past hedgeDelay (60ms), fallback wins automatically and streams full bytes
	req1 := httptest.NewRequest(http.MethodGet, mediaPath, nil)
	req1.Header.Set("Range", "bytes=0-11")
	rec1 := httptest.NewRecorder()
	svc.ProxyInvidious(rec1, req1)

	if rec1.Code != http.StatusPartialContent {
		t.Fatalf("req1 expected 206, got %d body=%s", rec1.Code, rec1.Body.String())
	}
	if rec1.Body.String() != "MP4-CHUNK-OK" {
		t.Fatalf("req1 body mismatch: got %q", rec1.Body.String())
	}
	if badHits.Load() != 1 || goodHits.Load() != 1 {
		t.Fatalf("req1 expected badHits=1 goodHits=1, got bad=%d good=%d", badHits.Load(), goodHits.Load())
	}

	// Request 2 with same stalled primary host should go directly to cached preferred rr2---sn-good
	req2 := httptest.NewRequest(http.MethodGet, mediaPath, nil)
	req2.Header.Set("Range", "bytes=0-11")
	rec2 := httptest.NewRecorder()
	svc.ProxyInvidious(rec2, req2)

	if rec2.Code != http.StatusPartialContent || rec2.Body.String() != "MP4-CHUNK-OK" {
		t.Fatalf("req2 failed: code=%d body=%q", rec2.Code, rec2.Body.String())
	}
	if badHits.Load() != 1 {
		t.Fatalf("req2 should use cached preferred host without calling stalled primary again, badHits=%d", badHits.Load())
	}
	if goodHits.Load() != 2 {
		t.Fatalf("req2 expected goodHits=2, got %d", goodHits.Load())
	}
}

func TestProxyInvidiousLatestVersionUsesCachedCompanionWithFailover(t *testing.T) {
	var upstreamLatestHits atomic.Int32
	mockUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/invidious/api/v1/videos/vid123":
			w.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprint(w, `{
				"title":"Test Video",
				"formatStreams":[
					{"itag":18,"url":"/companion/videoplayback?expire=1795&mn=sn-stall%2Csn-fast&fvip=3&sig=abc%3D&host=rr5---sn-stall.googlevideo.com"}
				]
			}`)
		case r.URL.Path == "/companion/videoplayback":
			if r.URL.Query().Get("host") == "rr3---sn-fast.googlevideo.com" {
				w.Header().Set("Content-Type", "video/mp4")
				w.Header().Set("Content-Range", "bytes 0-7/100")
				w.WriteHeader(http.StatusPartialContent)
				_, _ = w.Write([]byte("FAST-MP4"))
				return
			}
			select {
			case <-time.After(3 * time.Second):
				w.WriteHeader(http.StatusGatewayTimeout)
			case <-r.Context().Done():
			}
		case r.URL.Path == "/api/invidious/latest_version":
			upstreamLatestHits.Add(1)
			w.WriteHeader(http.StatusBadGateway)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer mockUpstream.Close()

	t.Setenv("WARP_PROXY", "off")
	svc := NewService(mockUpstream.URL, mockUpstream.URL+"/api/invidious")
	svc.hedgeDelay = 50 * time.Millisecond

	req := httptest.NewRequest(http.MethodGet, "/api/invidious/latest_version?id=vid123&itag=18&local=true", nil)
	req.Header.Set("Range", "bytes=0-7")
	rec := httptest.NewRecorder()
	svc.ProxyInvidious(rec, req)

	if rec.Code != http.StatusPartialContent {
		t.Fatalf("expected 206, got %d (%s)", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "FAST-MP4" {
		t.Fatalf("unexpected body %q", rec.Body.String())
	}
	if upstreamLatestHits.Load() != 0 {
		t.Fatalf("expected cached format failover instead of hitting stalled /latest_version, hits=%d", upstreamLatestHits.Load())
	}
}

func TestDoRacedRecoversFromStalledFirstAttempt(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := hits.Add(1)
		if n == 1 {
			// Simulates a silently dead pooled connection: never answers.
			select {
			case <-time.After(5 * time.Second):
			case <-r.Context().Done():
			}
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("fast-ok"))
	}))
	defer srv.Close()

	t.Setenv("WARP_PROXY", "off")
	svc := NewService(srv.URL, srv.URL+"/api/invidious")
	svc.raceDelay = 60 * time.Millisecond

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/x", nil)
	start := time.Now()
	resp, err := svc.doRequest(req, false, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	body := make([]byte, 16)
	n, _ := resp.Body.Read(body)
	resp.Body.Close()
	if string(body[:n]) != "fast-ok" {
		t.Fatalf("unexpected body %q", body[:n])
	}
	if d := time.Since(start); d > 2*time.Second {
		t.Fatalf("expected fast recovery via fresh connection, took %v", d)
	}
}

func TestDoRacedReturnsPrimaryWhenFast(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		_, _ = w.Write([]byte("ok"))
	}))
	defer srv.Close()
	t.Setenv("WARP_PROXY", "off")
	svc := NewService(srv.URL, srv.URL+"/api/invidious")
	svc.raceDelay = 500 * time.Millisecond
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/x", nil)
	resp, err := svc.doRequest(req, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	time.Sleep(700 * time.Millisecond)
	if hits.Load() != 1 {
		t.Fatalf("a fast primary must not trigger a duplicate request, hits=%d", hits.Load())
	}
}
