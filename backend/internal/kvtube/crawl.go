package kvtube

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// CrawledVideoItem holds normalized metadata for a newly discovered AI video or short drama.
type CrawledVideoItem struct {
	VideoID       string
	Title         string
	Channel       string
	AuthorID      string
	Description   string
	LengthSeconds int
	ViewCount     int64
	PublishedText string
}

// SearchLatestVideos queries YouTube InnerTube / Invidious search for recent AI videos & short dramas.
func (s *Service) SearchLatestVideos(ctx context.Context, query string, sortByDate bool) ([]CrawledVideoItem, error) {
	items, err := s.searchInnerTube(ctx, query, sortByDate)
	if err == nil && len(items) > 0 {
		return items, nil
	}
	invItems, invErr := s.searchInvidious(ctx, query, sortByDate)
	if invErr == nil && len(invItems) > 0 {
		return invItems, nil
	}
	if err != nil {
		return nil, err
	}
	return invItems, invErr
}

func (s *Service) searchInnerTube(ctx context.Context, query string, sortByDate bool) ([]CrawledVideoItem, error) {
	payload := map[string]interface{}{
		"context": map[string]interface{}{
			"client": map[string]interface{}{
				"clientName":    "WEB",
				"clientVersion": "2.20250317.01.00",
				"hl":            "vi",
				"gl":            "VN",
			},
		},
		"query": query,
	}
	if sortByDate {
		// Standard YouTube search upload-date sort parameter
		payload["params"] = "CAI%253D"
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://www.youtube.com/youtubei/v1/search?prettyPrint=false", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "vi-VN,vi;q=0.9,en-US;q=0.8")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

	resp, err := s.doRequest(req, false, bodyBytes)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("innertube search status %d", resp.StatusCode)
	}

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return nil, err
	}

	var root map[string]interface{}
	if err := json.Unmarshal(raw, &root); err != nil {
		return nil, err
	}

	var results []CrawledVideoItem
	seen := make(map[string]bool)
	extractInnerTubeRenderers(root, &results, seen)
	return results, nil
}

func extractInnerTubeRenderers(node interface{}, out *[]CrawledVideoItem, seen map[string]bool) {
	switch val := node.(type) {
	case map[string]interface{}:
		if vr, ok := val["videoRenderer"].(map[string]interface{}); ok {
			if item, ok := parseVideoRenderer(vr); ok && !seen[item.VideoID] {
				seen[item.VideoID] = true
				*out = append(*out, item)
			}
			return
		}
		for _, v := range val {
			extractInnerTubeRenderers(v, out, seen)
		}
	case []interface{}:
		for _, elem := range val {
			extractInnerTubeRenderers(elem, out, seen)
		}
	}
}

func parseVideoRenderer(vr map[string]interface{}) (CrawledVideoItem, bool) {
	id, _ := vr["videoId"].(string)
	id = strings.TrimSpace(id)
	if len(id) < 6 {
		return CrawledVideoItem{}, false
	}

	title := extractRunsText(vr["title"])
	if title == "" {
		return CrawledVideoItem{}, false
	}

	channel := extractRunsText(vr["ownerText"])
	if channel == "" {
		channel = extractRunsText(vr["longBylineText"])
	}
	if channel == "" {
		channel = extractRunsText(vr["shortBylineText"])
	}
	authorID := extractBrowseID(vr["ownerText"])
	if authorID == "" {
		authorID = extractBrowseID(vr["longBylineText"])
	}

	lengthStr := extractSimpleOrRunsText(vr["lengthText"])
	lengthSec := parseClockDuration(lengthStr)

	viewStr := extractSimpleOrRunsText(vr["viewCountText"])
	viewCount := parseFuzzyViewCount(viewStr)

	pubText := extractSimpleOrRunsText(vr["publishedTimeText"])
	desc := extractSnippetText(vr)

	return CrawledVideoItem{
		VideoID:       id,
		Title:         title,
		Channel:       channel,
		AuthorID:      authorID,
		Description:   desc,
		LengthSeconds: lengthSec,
		ViewCount:     viewCount,
		PublishedText: pubText,
	}, true
}

func (s *Service) searchInvidious(ctx context.Context, query string, sortByDate bool) ([]CrawledVideoItem, error) {
	sortBy := "relevance"
	if sortByDate {
		sortBy = "date"
	}
	apiURL := fmt.Sprintf("%s/api/v1/search?q=%s&type=video&sort_by=%s",
		s.UpstreamRoot, url.QueryEscape(query), url.QueryEscape(sortBy))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PhimAI/2.0")

	resp, err := s.doRequest(req, false, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("invidious search status %d", resp.StatusCode)
	}

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return nil, err
	}

	var arr []map[string]interface{}
	if err := json.Unmarshal(raw, &arr); err != nil {
		return nil, err
	}

	out := make([]CrawledVideoItem, 0, len(arr))
	for _, entry := range arr {
		id, _ := entry["videoId"].(string)
		title, _ := entry["title"].(string)
		if id == "" || title == "" {
			continue
		}
		author, _ := entry["author"].(string)
		authorID, _ := entry["authorId"].(string)
		desc, _ := entry["description"].(string)
		pubText, _ := entry["publishedText"].(string)
		out = append(out, CrawledVideoItem{
			VideoID:       strings.TrimSpace(id),
			Title:         strings.TrimSpace(title),
			Channel:       strings.TrimSpace(author),
			AuthorID:      strings.TrimSpace(authorID),
			Description:   strings.TrimSpace(desc),
			LengthSeconds: toInt(entry["lengthSeconds"]),
			ViewCount:     toInt64(entry["viewCount"]),
			PublishedText: pubText,
		})
	}
	return out, nil
}

// FetchChannelLatestVideos fetches recent releases from a known YouTube/PhimAI channel.
func (s *Service) FetchChannelLatestVideos(ctx context.Context, authorID string, channelName string) ([]CrawledVideoItem, error) {
	if !strings.HasPrefix(authorID, "UC") {
		return nil, fmt.Errorf("invalid authorId")
	}

	// 1. Prefer upstream channel API because it includes video duration
	up, err := s.GetChannelUpstream(ctx, authorID)
	if err == nil && up != nil {
		var out []CrawledVideoItem
		if latest, ok := up["latestVideos"].([]interface{}); ok {
			for _, rawItem := range latest {
				m, ok := rawItem.(map[string]interface{})
				if !ok {
					continue
				}
				id, _ := m["videoId"].(string)
				title, _ := m["title"].(string)
				if id == "" || title == "" {
					continue
				}
				ch, _ := m["author"].(string)
				if ch == "" {
					ch = channelName
				}
				pubText, _ := m["publishedText"].(string)
				out = append(out, CrawledVideoItem{
					VideoID:       id,
					Title:         title,
					Channel:       ch,
					AuthorID:      authorID,
					LengthSeconds: toInt(m["lengthSeconds"]),
					ViewCount:     toInt64(m["viewCount"]),
					PublishedText: pubText,
				})
			}
		}
		if len(out) > 0 {
			return out, nil
		}
	}

	// 2. Fallback to YouTube Atom RSS feed (/feeds/videos.xml)
	rssURL := fmt.Sprintf("https://www.youtube.com/feeds/videos.xml?channel_id=%s", url.QueryEscape(authorID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rssURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PhimAI/2.0")

	resp, err := s.doRequest(req, false, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("rss status %d", resp.StatusCode)
	}

	var feed struct {
		Author struct {
			Name string `xml:"name"`
		} `xml:"author"`
		Entries []struct {
			VideoID   string `xml:"videoId"`
			Title     string `xml:"title"`
			Published string `xml:"published"`
			Group     struct {
				Description string `xml:"description"`
			} `xml:"group"`
		} `xml:"entry"`
	}
	if err := xml.NewDecoder(io.LimitReader(resp.Body, 1024*1024)).Decode(&feed); err != nil {
		return nil, err
	}

	chName := strings.TrimSpace(feed.Author.Name)
	if chName == "" {
		chName = channelName
	}
	out := make([]CrawledVideoItem, 0, len(feed.Entries))
	for _, entry := range feed.Entries {
		if entry.VideoID == "" || entry.Title == "" {
			continue
		}
		out = append(out, CrawledVideoItem{
			VideoID:       strings.TrimSpace(entry.VideoID),
			Title:         strings.TrimSpace(entry.Title),
			Channel:       chName,
			AuthorID:      authorID,
			Description:   strings.TrimSpace(entry.Group.Description),
			LengthSeconds: 1800, // RSS omits runtime; mark standard episodic length
			PublishedText: entry.Published,
		})
	}
	return out, nil
}

// FetchPlaylistVideos retrieves all videos inside a YouTube playlist ID (e.g. PL...) via InnerTube or Invidious.
func (s *Service) FetchPlaylistVideos(ctx context.Context, playlistID string, defaultChannel string) ([]CrawledVideoItem, error) {
	playlistID = strings.TrimSpace(playlistID)
	if len(playlistID) < 8 {
		return nil, fmt.Errorf("invalid playlistID")
	}
	if items, err := s.fetchPlaylistInnerTube(ctx, playlistID, defaultChannel); err == nil && len(items) > 0 {
		return items, nil
	}
	return s.fetchPlaylistInvidious(ctx, playlistID, defaultChannel)
}

func (s *Service) fetchPlaylistInnerTube(ctx context.Context, playlistID string, defaultChannel string) ([]CrawledVideoItem, error) {
	payload := map[string]interface{}{
		"context": map[string]interface{}{
			"client": map[string]interface{}{
				"clientName":    "WEB",
				"clientVersion": "2.20250317.01.00",
				"hl":            "vi",
				"gl":            "VN",
			},
		},
		"browseId": "VL" + playlistID,
	}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

	resp, err := s.doRequest(req, false, bodyBytes)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("playlist browse status %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return nil, err
	}
	var root map[string]interface{}
	if err := json.Unmarshal(raw, &root); err != nil {
		return nil, err
	}
	var out []CrawledVideoItem
	seen := make(map[string]bool)
	extractPlaylistRenderers(root, defaultChannel, &out, seen)
	return out, nil
}

func extractPlaylistRenderers(node interface{}, defaultChannel string, out *[]CrawledVideoItem, seen map[string]bool) {
	switch val := node.(type) {
	case map[string]interface{}:
		if pr, ok := val["playlistVideoRenderer"].(map[string]interface{}); ok {
			id, _ := pr["videoId"].(string)
			title := extractSimpleOrRunsText(pr["title"])
			if id != "" && title != "" && !seen[id] {
				seen[id] = true
				ch := extractSimpleOrRunsText(pr["shortBylineText"])
				if ch == "" {
					ch = defaultChannel
				}
				durSec := toInt(pr["lengthSeconds"])
				if durSec == 0 {
					durSec = parseClockDuration(extractSimpleOrRunsText(pr["lengthText"]))
				}
				*out = append(*out, CrawledVideoItem{
					VideoID:       strings.TrimSpace(id),
					Title:         strings.TrimSpace(title),
					Channel:       strings.TrimSpace(ch),
					AuthorID:      extractBrowseID(pr["shortBylineText"]),
					LengthSeconds: durSec,
				})
			}
			return
		}
		for _, v := range val {
			extractPlaylistRenderers(v, defaultChannel, out, seen)
		}
	case []interface{}:
		for _, elem := range val {
			extractPlaylistRenderers(elem, defaultChannel, out, seen)
		}
	}
}

func (s *Service) fetchPlaylistInvidious(ctx context.Context, playlistID string, defaultChannel string) ([]CrawledVideoItem, error) {
	apiURL := fmt.Sprintf("%s/api/v1/playlists/%s", s.UpstreamRoot, url.PathEscape(playlistID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PhimAI/2.0")
	resp, err := s.doRequest(req, false, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("invidious playlist status %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return nil, err
	}
	var pl struct {
		Author string                   `json:"author"`
		Videos []map[string]interface{} `json:"videos"`
	}
	if err := json.Unmarshal(raw, &pl); err != nil {
		return nil, err
	}
	out := make([]CrawledVideoItem, 0, len(pl.Videos))
	for _, entry := range pl.Videos {
		id, _ := entry["videoId"].(string)
		title, _ := entry["title"].(string)
		if id == "" || title == "" {
			continue
		}
		ch, _ := entry["author"].(string)
		if ch == "" {
			ch = pl.Author
		}
		if ch == "" {
			ch = defaultChannel
		}
		out = append(out, CrawledVideoItem{
			VideoID:       strings.TrimSpace(id),
			Title:         strings.TrimSpace(title),
			Channel:       strings.TrimSpace(ch),
			AuthorID:      fmt.Sprintf("%v", entry["authorId"]),
			LengthSeconds: toInt(entry["lengthSeconds"]),
			ViewCount:     toInt64(entry["viewCount"]),
		})
	}
	return out, nil
}

func extractSimpleOrRunsText(v interface{}) string {
	m, ok := v.(map[string]interface{})
	if !ok {
		return ""
	}
	if s, ok := m["simpleText"].(string); ok && s != "" {
		return strings.TrimSpace(s)
	}
	return extractRunsText(v)
}

func extractRunsText(v interface{}) string {
	m, ok := v.(map[string]interface{})
	if !ok {
		return ""
	}
	runs, ok := m["runs"].([]interface{})
	if !ok {
		return ""
	}
	var b strings.Builder
	for _, r := range runs {
		if rm, ok := r.(map[string]interface{}); ok {
			if txt, ok := rm["text"].(string); ok {
				b.WriteString(txt)
			}
		}
	}
	return strings.TrimSpace(b.String())
}

func extractBrowseID(v interface{}) string {
	m, ok := v.(map[string]interface{})
	if !ok {
		return ""
	}
	runs, ok := m["runs"].([]interface{})
	if !ok || len(runs) == 0 {
		return ""
	}
	r0, ok := runs[0].(map[string]interface{})
	if !ok {
		return ""
	}
	nav, ok := r0["navigationEndpoint"].(map[string]interface{})
	if !ok {
		return ""
	}
	browse, ok := nav["browseEndpoint"].(map[string]interface{})
	if !ok {
		return ""
	}
	bid, _ := browse["browseId"].(string)
	return strings.TrimSpace(bid)
}

func extractSnippetText(vr map[string]interface{}) string {
	if snips, ok := vr["detailedMetadataSnippets"].([]interface{}); ok && len(snips) > 0 {
		if sm, ok := snips[0].(map[string]interface{}); ok {
			if txt := extractRunsText(sm["snippetText"]); txt != "" {
				return txt
			}
		}
	}
	if d := extractRunsText(vr["descriptionSnippet"]); d != "" {
		return d
	}
	return ""
}

func parseClockDuration(s string) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	parts := strings.Split(s, ":")
	total := 0
	for _, p := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err != nil {
			return 0
		}
		total = total*60 + n
	}
	return total
}

func parseFuzzyViewCount(s string) int64 {
	lower := strings.ToLower(strings.TrimSpace(s))
	if lower == "" {
		return 0
	}
	// Strip words like "lượt xem", "views", "view"
	lower = strings.ReplaceAll(lower, "lượt xem", "")
	lower = strings.ReplaceAll(lower, "views", "")
	lower = strings.ReplaceAll(lower, "view", "")
	lower = strings.TrimSpace(lower)

	multiplier := float64(1)
	if strings.Contains(lower, "tr") || strings.Contains(lower, "m") {
		multiplier = 1_000_000
	} else if strings.Contains(lower, "n") || strings.Contains(lower, "k") {
		multiplier = 1_000
	}

	var numBuf strings.Builder
	hasComma := strings.Contains(lower, ",")
	hasDot := strings.Contains(lower, ".")
	for _, r := range lower {
		if r >= '0' && r <= '9' {
			numBuf.WriteRune(r)
		} else if (r == ',' || r == '.') && multiplier > 1 && !(hasComma && hasDot) {
			numBuf.WriteByte('.')
		}
	}
	numStr := numBuf.String()
	if numStr == "" {
		return 0
	}
	if multiplier == 1 {
		n, _ := strconv.ParseInt(numStr, 10, 64)
		return n
	}
	numStr = strings.ReplaceAll(numStr, ",", ".")
	f, err := strconv.ParseFloat(numStr, 64)
	if err != nil {
		return 0
	}
	return int64(f * multiplier)
}
