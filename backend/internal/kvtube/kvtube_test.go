package kvtube

import (
	"strings"
	"testing"
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
