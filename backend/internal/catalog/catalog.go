package catalog

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"phimai-backend/internal/models"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

type Catalog struct {
	mu           sync.RWMutex
	DataDir      string
	KVTubeURL    string
	Manifest     map[string]interface{}
	Films        []models.Film
	ByID         map[string]*models.Film
	ByRank       map[int]*models.Film
	DeadIDs      map[string]bool
	ChannelIDs   map[string]string
	Playlists    []map[string]interface{}
	SeriesByFilm map[string][]models.Film
	ScreeningRaw map[string]interface{}

	// Auto-crawler state (protected by mu)
	CrawledIDs      map[string]bool
	SeriesCrawlAt   map[string]time.Time
	CrawlRunning    bool
	LastCrawlAt     time.Time
	TotalCrawled    int
	LastCrawlAdded  int
	LastCrawlError  string
	CrawlCycleCount int
	BaseMaxRank     int
	RecentCrawled   []models.Film
	TopWeekMeta     struct {
		Week   string `json:"week"`
		Plays  int    `json:"plays"`
		Filled bool   `json:"filled"`
		TopIDs []struct {
			ID    string `json:"id"`
			Count int    `json:"count"`
		}
	}
}

var (
	genreGroups = map[string][]string{
		"xuyên không": {"xuyên không", "xuyen-khong", "xuyên sách", "xuyen-sach", "hai thế giới", "hai-the-gioi"},
		"tu tiên":     {"tu tiên", "tu-tien", "tiên hiệp", "tien-hiep", "huyền huyễn", "huyen-huyen", "tu luyện", "tu-luyen", "phế vật vươn lên", "phe-vat", "vô địch", "vo-dich", "triệu hồi", "trieu-hoi", "thức tỉnh", "thuc-tinh", "thiên phú", "thien-phu"},
		"ngôn tình":   {"ngôn tình", "ngon-tinh", "đam mỹ", "tình cảm", "tinh-cam", "sủng ái", "sung", "hôn nhân", "hon-nhan", "ly hôn", "ly-hon", "tiểu thư", "thieu-gia", "thiên kim", "thien-kim", "công chúa", "cong-chua", "hoàng tử", "hoang-tu", "thế tử", "the-tu"},
		"hệ thống":    {"hệ thống", "he-thong"},
		"trọng sinh":  {"trọng sinh", "trong-sinh", "trung-sinh"},
		"mạt thế":     {"mạt thế", "mat-the", "mathe", "tận thế", "tan-the", "zombie", "quỷ dị", "quy-di"},
		"kỳ ảo":       {"kỳ ảo", "thần thoại", "dị năng", "di-nang", "không gian", "khong-gian"},
		"cổ trang":    {"cung đấu", "cổ trang", "co-trang", "cổ đại", "co-dai", "kiếm hiệp", "báo thù", "bao-thu", "chiến thần", "chiến tranh", "chien-tranh", "tam quốc", "tam-quoc", "nữ cường", "phản diện", "phan-dien"},
		"tổng tài":    {"tổng tài", "tong-tai", "hào môn", "hao-mon", "làm giàu", "lam-giau", "đô thị", "do-thi", "hiện đại", "hien-dai"},
		"sinh tồn":    {"sinh tồn", "sinh-ton", "sinhton"},
		"viễn tưởng":  {"viễn tưởng", "scifi", "sci-fi"},
		"gia đình":    {"gia đình", "gia-dinh", "đời đời", "doi-doi", "bé gái", "be-gai"},
		"kinh dị":     {"kinh dị", "kinh-di"},
		"hài hước":    {"hài hước", "hai-huoc", "cười", "cuoi", "học đường", "hoc-duong"},
	}

	genderTags = map[string][]string{
		"nam": {"tu tiên", "hệ thống", "chiến thần", "kiếm hiệp", "sinh tồn", "mạt thế", "dị năng"},
		"nu":  {"ngôn tình", "tổng tài", "cung đấu", "nữ cường", "gia đình"},
	}

	reDurGioPhut = regexp.MustCompile(`(\d+)\s*giờ(?:\s*(\d+))?`)
	reDurG       = regexp.MustCompile(`(\d+)g(\d+)`)
	reDurPhut    = regexp.MustCompile(`(\d+)\s*phút`)
	reSeriesMon  = regexp.MustCompile(`(?i)\series|phần|mùa|tập|trọn`)
	rePartRange  = regexp.MustCompile(`(?i)(?:tap|tập|phan|phần|part|ep|episode)\s*\d+\s*[-–~]\s*\d+`)
	rePartNum    = regexp.MustCompile(`\b(?:tap|phan|part|ep|episode|chuong|chapter|mua|season|p)\s*0*(\d+)\b`)
	reBracketTag = regexp.MustCompile(`(?:【[^】]*】|\[[^\]]*\])`)
	reRawEpStrip = regexp.MustCompile(`(?i)[\(\[【]?\s*(?:tap|tập|phan|phần|part|ep|episode|chương|chuong|mùa|mua|season|p)\s*0*\d+(?:\s*[-–~]\s*\d+)?\s*[\)\]】.\-:]*`)

	genericSeriesPrefixes = map[string]bool{
		"phim":            true,
		"phim ai":         true,
		"phim ngan":       true,
		"phim moi":        true,
		"phim hay":        true,
		"review phim":     true,
		"phim thuyet minh": true,
		"phim vietsub":    true,
		"phim ngon tinh":  true,
		"phim co trang":   true,
		"hoat hinh":       true,
		"hoat hinh 3d":    true,
		"short drama":     true,
		"full bo":         true,
		"tron bo":         true,
		"noi bat":         true,
		"tap moi":         true,
		"phan moi":        true,
	}
)

func NewCatalog(dataDir string, kvtubeURL string) *Catalog {
	c := &Catalog{
		DataDir:      dataDir,
		KVTubeURL:    strings.TrimRight(kvtubeURL, "/"),
		Manifest:     make(map[string]interface{}),
		ByID:         make(map[string]*models.Film),
		ByRank:       make(map[int]*models.Film),
		DeadIDs:      make(map[string]bool),
		ChannelIDs:   make(map[string]string),
		CrawledIDs:    make(map[string]bool),
		SeriesCrawlAt: make(map[string]time.Time),
		SeriesByFilm:  make(map[string][]models.Film),
		ScreeningRaw: make(map[string]interface{}),
	}
	c.loadAll()
	return c
}

func ViNorm(s string) string {
	if s == "" {
		return ""
	}
	lower := strings.ToLower(s)
	lower = strings.ReplaceAll(lower, "đ", "d")
	t := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)
	res, _, err := transform.String(t, lower)
	if err != nil {
		res = lower
	}
	var b strings.Builder
	b.Grow(len(res))
	lastSpace := true
	for _, r := range res {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastSpace = false
		} else if !lastSpace {
			b.WriteByte(' ')
			lastSpace = true
		}
	}
	return strings.TrimSpace(b.String())
}

func parseDurMinutes(dur string, cat string) int {
	d := strings.ToLower(dur)
	if m := reDurGioPhut.FindStringSubmatch(d); len(m) >= 2 {
		h, _ := strconv.Atoi(m[1])
		mins := 0
		if len(m) >= 3 && m[2] != "" {
			mins, _ = strconv.Atoi(m[2])
		}
		return h*60 + mins
	}
	if m := reDurG.FindStringSubmatch(d); len(m) >= 3 {
		h, _ := strconv.Atoi(m[1])
		mins, _ := strconv.Atoi(m[2])
		return h*60 + mins
	}
	if m := reDurPhut.FindStringSubmatch(d); len(m) >= 2 {
		mins, _ := strconv.Atoi(m[1])
		return mins
	}
	if cat == "ngan" {
		return 12
	}
	if reSeriesMon.MatchString(d) {
		return 150
	}
	return 45
}

func parseViewsNum(v string) int64 {
	if v == "" {
		return 0
	}
	cleaned := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, v)
	n, _ := strconv.ParseInt(cleaned, 10, 64)
	return n
}

func (c *Catalog) enrichFilm(f *models.Film) {
	if f.Tags == nil {
		f.Tags = []string{}
	}
	f.ThumbnailURL = "/api/kvtube/thumb/" + f.ID
	f.WatchURL = "/watch?v=" + f.ID
	f.EmbedURL = "/watch?v=" + f.ID
	f.StreamURL = "/api/invidious/latest_version?id=" + f.ID + "&itag=18&local=true"
	if f.Channel != "" {
		f.ChannelURL = "/channel/" + url.PathEscape(f.Channel)
	}
	f.ViewsNum = parseViewsNum(f.Views)
	f.DurMins = parseDurMinutes(f.Dur, f.Cat)
	lowerDur := strings.ToLower(f.Dur)
	f.IsFull = strings.Contains(lowerDur, "full") || strings.Contains(lowerDur, "trọn")
	f.NormTitle = ViNorm(f.Title)
	f.NormChannel = ViNorm(f.Channel)
	f.NormSearch = ViNorm(f.Title + " " + f.Channel + " " + f.Tool + " " + f.Blurb + " " + f.BlurbLong + " " + f.Cat + " " + strings.Join(f.Tags, " "))
}

func (c *Catalog) loadAll() {
	c.mu.Lock()
	defer c.mu.Unlock()

	// 1. Load meta-extra.json (deadIds, channelIds, playlists)
	if raw, err := os.ReadFile(filepath.Join(c.DataDir, "meta-extra.json")); err == nil {
		var extra struct {
			DeadIDs    []string                 `json:"deadIds"`
			ChannelIDs map[string]string        `json:"channelIds"`
			Playlists  []map[string]interface{} `json:"playlists"`
		}
		if json.Unmarshal(raw, &extra) == nil {
			for _, id := range extra.DeadIDs {
				c.DeadIDs[id] = true
			}
			for k, v := range extra.ChannelIDs {
				c.ChannelIDs[k] = v
			}
			c.Playlists = extra.Playlists
		}
	}

	// 1b. Load dead-runtime.json (videos discovered at runtime to be Private/404)
	if raw, err := os.ReadFile(filepath.Join(c.DataDir, "dead-runtime.json")); err == nil {
		var deadList []string
		if json.Unmarshal(raw, &deadList) == nil {
			for _, id := range deadList {
				if id != "" {
					c.DeadIDs[id] = true
				}
			}
		}
	}

	// 2. Load manifest.json
	if raw, err := os.ReadFile(filepath.Join(c.DataDir, "manifest.json")); err == nil {
		_ = json.Unmarshal(raw, &c.Manifest)
	}

	// 3. Load search-index.json (9,220 rows)
	// Row format: [rank, id, title, channel, views, dur, cat, tool, blurb, tags, adult]
	filmMap := make(map[string]models.Film, 9500)
	if raw, err := os.ReadFile(filepath.Join(c.DataDir, "search-index.json")); err == nil {
		var rows [][]interface{}
		if err := json.Unmarshal(raw, &rows); err == nil {
			for _, r := range rows {
				if len(r) < 9 {
					continue
				}
				f := models.Film{
					Rank:    toInt(r[0]),
					ID:      toString(r[1]),
					Title:   toString(r[2]),
					Channel: toString(r[3]),
					Views:   toString(r[4]),
					Dur:     toString(r[5]),
					Cat:     toString(r[6]),
					Tool:    toString(r[7]),
					Blurb:   toString(r[8]),
					Tags:    toStringSlice(safeIdx(r, 9)),
					Adult:   toBool(safeIdx(r, 10)),
				}
				if f.ID != "" {
					filmMap[f.ID] = f
				}
			}
		} else {
			log.Printf("Warning: failed to parse search-index.json: %v", err)
		}
	}

	// 4. Merge richer film objects (with blurbLong) from films-first.json, films-new.json, films-hot.json
	c.mergeFilmArrayFile(filmMap, filepath.Join(c.DataDir, "films-first.json"))
	c.mergeFilmItemsFile(filmMap, filepath.Join(c.DataDir, "films-new.json"))
	c.mergeFilmItemsFile(filmMap, filepath.Join(c.DataDir, "films-hot.json"))

	maxStaticRank := 0
	for _, f := range filmMap {
		if f.Rank > maxStaticRank {
			maxStaticRank = f.Rank
		}
	}
	c.BaseMaxRank = maxStaticRank

	// 4b. Load persisted auto-crawled AI videos & short dramas
	c.loadCrawledFilmsFile(filmMap, filepath.Join(c.DataDir, "crawled-films.json"))

	// Build sorted slice (by Rank DESC for newest first)
	c.Films = make([]models.Film, 0, len(filmMap))
	for _, f := range filmMap {
		c.enrichFilm(&f)
		c.Films = append(c.Films, f)
	}
	sort.Slice(c.Films, func(i, j int) bool {
		return c.Films[i].Rank > c.Films[j].Rank
	})

	for i := range c.Films {
		f := &c.Films[i]
		c.ByID[f.ID] = f
		c.ByRank[f.Rank] = f
	}
	c.rebuildManifestCountsLocked()

	// 5. Build series grouping map
	c.buildSeriesGroups()

	// 6. Load screening.json & topweek.json
	if raw, err := os.ReadFile(filepath.Join(c.DataDir, "screening.json")); err == nil {
		_ = json.Unmarshal(raw, &c.ScreeningRaw)
	}
	if raw, err := os.ReadFile(filepath.Join(c.DataDir, "topweek.json")); err == nil {
		var tw struct {
			Week   string `json:"week"`
			Plays  int    `json:"plays"`
			Filled bool   `json:"filled"`
			Top    []struct {
				ID    string `json:"id"`
				Count int    `json:"count"`
			} `json:"top"`
		}
		if json.Unmarshal(raw, &tw) == nil {
			c.TopWeekMeta.Week = tw.Week
			c.TopWeekMeta.Plays = tw.Plays
			c.TopWeekMeta.Filled = tw.Filled
			c.TopWeekMeta.TopIDs = tw.Top
		}
	}

	log.Printf("Catalog loaded: %d total films (%d dead excluded), %d series-grouped films",
		len(c.Films), len(c.DeadIDs), len(c.SeriesByFilm))
}

func (c *Catalog) mergeFilmArrayFile(filmMap map[string]models.Film, path string) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var list []models.Film
	if json.Unmarshal(raw, &list) == nil {
		for _, item := range list {
			if item.ID == "" {
				continue
			}
			if existing, ok := filmMap[item.ID]; ok {
				if item.BlurbLong != "" {
					existing.BlurbLong = item.BlurbLong
				}
				if len(item.Tags) > 0 {
					existing.Tags = item.Tags
				}
				filmMap[item.ID] = existing
			} else {
				filmMap[item.ID] = item
			}
		}
	}
}

func (c *Catalog) mergeFilmItemsFile(filmMap map[string]models.Film, path string) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var wrapper struct {
		Items []models.Film `json:"items"`
	}
	if json.Unmarshal(raw, &wrapper) == nil {
		for _, item := range wrapper.Items {
			if item.ID == "" {
				continue
			}
			if existing, ok := filmMap[item.ID]; ok {
				if item.BlurbLong != "" {
					existing.BlurbLong = item.BlurbLong
				}
				if len(item.Tags) > 0 {
					existing.Tags = item.Tags
				}
				filmMap[item.ID] = existing
			} else {
				filmMap[item.ID] = item
			}
		}
	}
}

// ExtractSeriesInfo extracts the normalized series key, human-readable movie title, and episode order from a title.
func ExtractSeriesInfo(title string, channel string) (seriesKey string, baseTitleRaw string, order int, hasPart bool) {
	normT := ViNorm(title)
	order = 9999
	isRange := rePartRange.MatchString(title)

	if !isRange {
		if m := rePartNum.FindStringSubmatch(normT); len(m) >= 2 {
			order, _ = strconv.Atoi(m[1])
			hasPart = true
		} else if strings.Contains(normT, "phan dau") || strings.Contains(normT, "tap dau") {
			order = 0
			hasPart = true
		} else if strings.Contains(normT, "phan cuoi") || strings.Contains(normT, "tap cuoi") {
			order = 999
			hasPart = true
		}
	}

	// Strip channel/edition bracket tags such as [Kiwi Only] or 【Thuyết Minh】
	cleanedTitle := strings.TrimSpace(reBracketTag.ReplaceAllString(title, " "))

	// Split primary title segments first on pipe/vertical bar, then hyphen/colon if needed
	pipeSegs := strings.FieldsFunc(cleanedTitle, func(r rune) bool {
		return r == '|' || r == '｜' || r == '│'
	})
	var candidates []string
	for _, ps := range pipeSegs {
		// Strip trailing "- Tập 01..." or "(Tập 01)" within a segment
		if idx := reRawEpStrip.FindStringIndex(ps); idx != nil && idx[0] > 2 {
			prefix := strings.TrimSpace(ps[:idx[0]])
			prefix = strings.TrimRight(prefix, "-–—:• ")
			if prefix != "" {
				candidates = append(candidates, prefix)
			}
		}
		cleaned := reRawEpStrip.ReplaceAllString(ps, " ")
		cleaned = strings.Trim(cleaned, "-–—:• ")
		if cleaned != "" {
			candidates = append(candidates, cleaned)
		}
		for _, sub := range strings.FieldsFunc(ps, func(r rune) bool { return r == '-' || r == ':' || r == '—' }) {
			subClean := strings.TrimSpace(reRawEpStrip.ReplaceAllString(sub, " "))
			if subClean != "" {
				candidates = append(candidates, subClean)
			}
		}
	}

	normCh := ViNorm(channel)
	for _, rawCand := range candidates {
		ns := ViNorm(rawCand)
		ns = rePartNum.ReplaceAllString(ns, "")
		ns = strings.TrimSpace(ns)
		words := strings.Fields(ns)
		if len(words) < 2 || ns == normCh || genericSeriesPrefixes[ns] {
			continue
		}
		if len(words) > 7 {
			// Keep clean prefix up to 7 words max for stable matching across varying episode subtitles
			ns = strings.Join(words[:7], " ")
		}
		baseTitleRaw = strings.TrimSpace(rawCand)
		rawWords := strings.Fields(baseTitleRaw)
		if len(rawWords) > 7 {
			baseTitleRaw = strings.Join(rawWords[:7], " ")
		}
		if !hasPart && len(words) < 5 {
			continue
		}
		return ns + "||" + normCh, baseTitleRaw, order, hasPart
	}
	return "", "", 9999, false
}

func (c *Catalog) buildSeriesGroups() {
	c.SeriesByFilm = make(map[string][]models.Film)
	type groupMember struct {
		film  models.Film
		order int
	}
	groups := make(map[string][]groupMember)

	for _, f := range c.Films {
		if c.DeadIDs[f.ID] || isBlockedSeriesTitle(f.Title) {
			continue
		}
		key, _, order, hasPart := ExtractSeriesInfo(f.Title, f.Channel)
		if key == "" || !hasPart {
			continue
		}
		groups[key] = append(groups[key], groupMember{film: f, order: order})
	}

	for _, members := range groups {
		if len(members) < 2 || len(members) > 120 {
			continue
		}
		sort.Slice(members, func(i, j int) bool {
			if members[i].order != members[j].order {
				return members[i].order < members[j].order
			}
			if members[i].film.ViewsNum != members[j].film.ViewsNum {
				return members[i].film.ViewsNum > members[j].film.ViewsNum
			}
			if members[i].film.Rank != members[j].film.Rank {
				return members[i].film.Rank > members[j].film.Rank
			}
			return members[i].film.ID < members[j].film.ID
		})

		// Deduplicate episodes sharing the same order (keep the best single film per episode order)
		dedup := make([]groupMember, 0, len(members))
		seenOrder := make(map[int]bool, len(members))
		seenID := make(map[string]bool, len(members))
		for _, m := range members {
			if seenOrder[m.order] || seenID[m.film.ID] {
				continue
			}
			seenOrder[m.order] = true
			seenID[m.film.ID] = true
			dedup = append(dedup, m)
		}

		// Enforce contiguous episode ordering: stop before any jump > 2 missing episodes
		filmSlice := make([]models.Film, 0, len(dedup))
		for i, m := range dedup {
			if i > 0 && (m.order-dedup[i-1].order-1) > 2 {
				break
			}
			filmSlice = append(filmSlice, m.film)
		}
		if len(filmSlice) < 2 {
			continue
		}
		for _, m := range filmSlice {
			c.SeriesByFilm[m.ID] = filmSlice
		}
	}
}

type FilterParams struct {
	Sort       string
	Cat        string
	Genre      string
	FullOnly   bool
	Mood       string
	Time       string
	FamilyMode bool
	Query      string
	Channel    string
	Tool       string
	IDs        []string
	Page       int
	Limit      int
}

func (c *Catalog) GetFilmByID(id string) (models.Film, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	f, ok := c.ByID[id]
	if !ok {
		return models.Film{}, false
	}
	return *f, true
}

func (c *Catalog) GetSeries(id string) []models.Film {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if s, ok := c.SeriesByFilm[id]; ok {
		return s
	}
	return []models.Film{}
}

func (c *Catalog) GetRelated(f models.Film, limit int) []models.Film {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if limit <= 0 {
		limit = 6
	}

	fSeriesKey, _, _, _ := ExtractSeriesInfo(f.Title, f.Channel)
	sameSeriesIDs := make(map[string]bool)
	for _, sf := range c.SeriesByFilm[f.ID] {
		sameSeriesIDs[sf.ID] = true
	}
	seenSeriesKeys := make(map[string]bool)
	if fSeriesKey != "" {
		seenSeriesKeys[fSeriesKey] = true
	}

	fTags := make(map[string]bool, len(f.Tags))
	for _, t := range f.Tags {
		nt := strings.ToLower(strings.TrimSpace(t))
		if nt != "" {
			fTags[nt] = true
		}
	}

	type scoredCand struct {
		film  models.Film
		score int
	}
	var scored []scoredCand
	for _, cand := range c.Films {
		if cand.ID == f.ID || c.DeadIDs[cand.ID] || sameSeriesIDs[cand.ID] {
			continue
		}
		score := 0
		if len(fTags) > 0 && len(cand.Tags) > 0 {
			for _, ct := range cand.Tags {
				if fTags[strings.ToLower(strings.TrimSpace(ct))] {
					score += 3
				}
			}
		}
		if cand.Cat != "" && cand.Cat == f.Cat {
			score += 4
		}
		if cand.Channel != "" && cand.Channel == f.Channel {
			score += 2
		}
		if score > 0 {
			scored = append(scored, scoredCand{film: cand, score: score})
		}
	}

	sort.Slice(scored, func(i, j int) bool {
		if scored[i].score != scored[j].score {
			return scored[i].score > scored[j].score
		}
		if scored[i].film.ViewsNum != scored[j].film.ViewsNum {
			return scored[i].film.ViewsNum > scored[j].film.ViewsNum
		}
		return scored[i].film.Rank > scored[j].film.Rank
	})

	out := make([]models.Film, 0, limit)
	seenID := make(map[string]bool, limit)
	tryAppend := func(cand models.Film) bool {
		if cand.ID == f.ID || c.DeadIDs[cand.ID] || sameSeriesIDs[cand.ID] || seenID[cand.ID] {
			return false
		}
		if isBlockedSeriesTitle(cand.Title) {
			return false
		}
		candSeriesKey, _, _, _ := ExtractSeriesInfo(cand.Title, cand.Channel)
		if fSeriesKey != "" && candSeriesKey == fSeriesKey {
			return false
		}
		if candSeriesKey != "" {
			if seenSeriesKeys[candSeriesKey] {
				return false
			}
			seenSeriesKeys[candSeriesKey] = true
		}
		seenID[cand.ID] = true
		out = append(out, cand)
		return len(out) >= limit
	}

	for _, sc := range scored {
		if tryAppend(sc.film) {
			return out
		}
	}
	for _, cand := range c.Films {
		if tryAppend(cand) {
			return out
		}
	}
	return out
}

func matchGenre(f models.Film, genre string) bool {
	if genre == "" || genre == "all" {
		return true
	}
	gLower := strings.ToLower(strings.TrimSpace(genre))
	gNorm := ViNorm(gLower)

	// Check canonical genre group
	for groupName, synonyms := range genreGroups {
		if groupName == gLower || ViNorm(groupName) == gNorm {
			for _, tag := range f.Tags {
				tLower := strings.ToLower(tag)
				tNorm := ViNorm(tag)
				for _, syn := range synonyms {
					if tLower == syn || tNorm == ViNorm(syn) {
						return true
					}
				}
			}
			return strings.Contains(f.NormSearch, gNorm)
		}
	}

	// Direct tag or search match
	for _, tag := range f.Tags {
		if strings.EqualFold(tag, gLower) || ViNorm(tag) == gNorm {
			return true
		}
	}
	return strings.Contains(f.NormSearch, gNorm)
}

func matchCategory(f models.Film, cat string, newCut int) bool {
	if cat == "" || cat == "all" || cat == "hot" || cat == "topview" || cat == "vote" || cat == "random" {
		return true
	}
	if cat == "new" {
		return f.Rank >= newCut
	}
	if cat == "nam" || cat == "nu" {
		allowed := genderTags[cat]
		for _, t := range f.Tags {
			for _, a := range allowed {
				if t == a || ViNorm(t) == ViNorm(a) {
					return true
				}
			}
		}
		return false
	}
	if cat == "khac" {
		switch f.Cat {
		case "scifi", "kinhdi", "vietnam", "dai", "ngan":
			return true
		}
		return false
	}
	return strings.EqualFold(f.Cat, cat)
}

func matchMood(f models.Film, mood string) bool {
	if mood == "" || mood == "all" {
		return true
	}
	switch mood {
	case "cuoi":
		return f.Cat == "hoathinh" || containsAny(f.NormSearch, "hai", "cuoi", "chua lanh", "de thuong", "gau truc", "do khoc")
	case "khoc":
		return containsAny(f.NormSearch, "cam dong", "nuoc mat", "gia dinh", "chua lanh", "nguoi me", "dua con")
	case "rung":
		return f.Cat == "kinhdi" || containsAny(f.NormSearch, "kinh di", "am anh", "quy di", "ma quai")
	case "xuyendem":
		return f.DurMins >= 180
	case "nhe":
		return f.Cat != "kinhdi" && (f.Cat == "hoathinh" || containsAny(f.NormSearch, "chua lanh", "nhe nhang", "de thuong", "am ap"))
	}
	return true
}

func matchTime(f models.Film, timeFilter string) bool {
	if timeFilter == "" || timeFilter == "all" {
		return true
	}
	m := f.DurMins
	switch timeFilter {
	case "u120":
		return m < 120
	case "h24":
		return m >= 120 && m <= 240
	case "o240", "cay":
		return m >= 240
	case "ngan":
		return m <= 30
	}
	return true
}

func matchFamily(f models.Film, family bool) bool {
	if !family {
		return true
	}
	if f.Cat == "kinhdi" || f.Adult {
		return false
	}
	if containsAny(f.NormSearch, "xac song", "kinh di", "am anh", "chet choc", "tan the", "ma ca rong") {
		return false
	}
	return true
}

func containsAny(haystack string, needles ...string) bool {
	for _, n := range needles {
		if strings.Contains(haystack, n) {
			return true
		}
	}
	return false
}

func (c *Catalog) QueryFilms(p FilterParams, hotCounts map[string]int, ratings map[string]models.RatingStat) ([]models.Film, int) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if p.Page <= 0 {
		p.Page = 1
	}
	if p.Limit <= 0 {
		p.Limit = 60
	}
	if p.Limit > 10000 {
		p.Limit = 10000
	}

	// Specific IDs lookup
	if len(p.IDs) > 0 {
		var items []models.Film
		for _, id := range p.IDs {
			id = strings.TrimSpace(id)
			if f, ok := c.ByID[id]; ok {
				items = append(items, *f)
			}
		}
		return paginate(items, p.Page, p.Limit), len(items)
	}

	// Exact #rank query
	qTrim := strings.TrimSpace(p.Query)
	if strings.HasPrefix(qTrim, "#") {
		if rk, err := strconv.Atoi(strings.TrimPrefix(qTrim, "#")); err == nil {
			if f, ok := c.ByRank[rk]; ok {
				return []models.Film{*f}, 1
			}
			return []models.Film{}, 0
		}
	}

	newCut := 9068
	if nc, ok := c.Manifest["newCut"]; ok {
		if n := toInt(nc); n > 0 {
			newCut = n
		}
	}

	qNorm := ViNorm(qTrim)
	qTokens := strings.Fields(qNorm)
	chanNorm := ViNorm(p.Channel)
	toolNorm := ViNorm(p.Tool)

	type scoredFilm struct {
		film  models.Film
		score int
	}

	var matched []scoredFilm
	for _, f := range c.Films {
		if c.DeadIDs[f.ID] {
			continue
		}
		if p.FullOnly && !f.IsFull {
			continue
		}
		if !matchCategory(f, p.Cat, newCut) {
			continue
		}
		if !matchGenre(f, p.Genre) {
			continue
		}
		if !matchMood(f, p.Mood) {
			continue
		}
		if !matchTime(f, p.Time) {
			continue
		}
		if !matchFamily(f, p.FamilyMode) {
			continue
		}
		if chanNorm != "" && f.NormChannel != chanNorm && !strings.Contains(f.NormChannel, chanNorm) {
			continue
		}
		if toolNorm != "" && !strings.Contains(ViNorm(f.Tool), toolNorm) {
			continue
		}

		score := 0
		if qNorm != "" {
			if strings.EqualFold(f.ID, qTrim) {
				score = 100
			} else if strings.Contains(f.NormTitle, qNorm) {
				score = 50
			} else if strings.Contains(f.NormSearch, qNorm) {
				score = 30
			} else if len(qTokens) > 1 {
				allHit := true
				for _, tok := range qTokens {
					if !strings.Contains(f.NormSearch, tok) {
						allHit = false
						break
					}
				}
				if allHit {
					score = 15
				}
			}
			if score == 0 {
				continue
			}
		}

		matched = append(matched, scoredFilm{film: f, score: score})
	}

	sortMode := strings.ToLower(p.Sort)
	if sortMode == "" && (p.Cat == "hot" || p.Cat == "topview" || p.Cat == "vote" || p.Cat == "new") {
		sortMode = p.Cat
	}

	switch sortMode {
	case "hot":
		sort.Slice(matched, func(i, j int) bool {
			ci := hotCounts[matched[i].film.ID]
			cj := hotCounts[matched[j].film.ID]
			if ci != cj {
				return ci > cj
			}
			if matched[i].film.ViewsNum != matched[j].film.ViewsNum {
				return matched[i].film.ViewsNum > matched[j].film.ViewsNum
			}
			return matched[i].film.Rank > matched[j].film.Rank
		})
	case "topview":
		sort.Slice(matched, func(i, j int) bool {
			if matched[i].film.ViewsNum != matched[j].film.ViewsNum {
				return matched[i].film.ViewsNum > matched[j].film.ViewsNum
			}
			return matched[i].film.Rank > matched[j].film.Rank
		})
	case "vote":
		sort.Slice(matched, func(i, j int) bool {
			ri := ratings[matched[i].film.ID]
			rj := ratings[matched[j].film.ID]
			if ri.S != rj.S {
				return ri.S > rj.S
			}
			if ri.N != rj.N {
				return ri.N > rj.N
			}
			return matched[i].film.Rank > matched[j].film.Rank
		})
	case "random":
		rng := rand.New(rand.NewSource(int64(len(matched)*31 + 20261117)))
		rng.Shuffle(len(matched), func(i, j int) {
			matched[i], matched[j] = matched[j], matched[i]
		})
	default: // "new" or search relevance
		if qNorm != "" {
			sort.Slice(matched, func(i, j int) bool {
				if matched[i].score != matched[j].score {
					return matched[i].score > matched[j].score
				}
				return matched[i].film.Rank > matched[j].film.Rank
			})
		} else {
			sort.Slice(matched, func(i, j int) bool {
				return matched[i].film.Rank > matched[j].film.Rank
			})
		}
	}

	out := make([]models.Film, len(matched))
	for i, m := range matched {
		out[i] = m.film
	}
	return paginate(out, p.Page, p.Limit), len(out)
}

type ChannelInfo struct {
	Name         string        `json:"name"`
	AuthorID     string        `json:"authorId,omitempty"`
	Count        int           `json:"count"`
	TotalViews   int64         `json:"totalViews"`
	FullCount    int           `json:"fullCount"`
	Thumbnail    string        `json:"thumbnail"`
	Banner       string        `json:"banner"`
	Categories   []string      `json:"categories"`
	URL          string        `json:"url"`
	PreviewFilms []models.Film `json:"previewFilms,omitempty"`
}

type ChannelPlaylist struct {
	ID        string        `json:"id"`
	Title     string        `json:"title"`
	Count     int           `json:"count"`
	Thumbnail string        `json:"thumbnail"`
	Films     []models.Film `json:"films"`
}

type ChannelDetail struct {
	ChannelInfo
	Description  string            `json:"description,omitempty"`
	SubCount     int64             `json:"subCount,omitempty"`
	AvatarURL    string            `json:"avatarUrl,omitempty"`
	BannerURL    string            `json:"bannerUrl,omitempty"`
	Films        []models.Film     `json:"films"`
	Playlists    []ChannelPlaylist `json:"playlists"`
	TotalMatched int               `json:"totalMatched"`
}

// ListChannels returns aggregated channel statistics across the full catalog.
func (c *Catalog) ListChannels(search string, sortBy string) []ChannelInfo {
	c.mu.RLock()
	defer c.mu.RUnlock()

	type chanAgg struct {
		name      string
		films     []models.Film
		views     int64
		fullCount int
		catsMap   map[string]int
	}

	aggs := make(map[string]*chanAgg)
	for _, f := range c.Films {
		if c.DeadIDs[f.ID] || f.Channel == "" {
			continue
		}
		a, ok := aggs[f.Channel]
		if !ok {
			a = &chanAgg{
				name:    f.Channel,
				catsMap: make(map[string]int),
			}
			aggs[f.Channel] = a
		}
		a.films = append(a.films, f)
		a.views += f.ViewsNum
		if f.IsFull {
			a.fullCount++
		}
		if f.Cat != "" {
			a.catsMap[f.Cat]++
		}
	}

	qNorm := ViNorm(search)
	list := make([]ChannelInfo, 0, len(aggs))
	for _, a := range aggs {
		if qNorm != "" && !strings.Contains(ViNorm(a.name), qNorm) {
			continue
		}
		// Sort channel films by ViewsNum DESC for banner + preview thumbnails
		byViews := make([]models.Film, len(a.films))
		copy(byViews, a.films)
		sort.Slice(byViews, func(i, j int) bool {
			if byViews[i].ViewsNum != byViews[j].ViewsNum {
				return byViews[i].ViewsNum > byViews[j].ViewsNum
			}
			return byViews[i].Rank > byViews[j].Rank
		})

		type catCnt struct {
			cat string
			cnt int
		}
		var cc []catCnt
		for k, v := range a.catsMap {
			cc = append(cc, catCnt{cat: k, cnt: v})
		}
		sort.Slice(cc, func(i, j int) bool { return cc[i].cnt > cc[j].cnt })
		cats := make([]string, 0, 4)
		for i := 0; i < len(cc) && i < 4; i++ {
			cats = append(cats, cc[i].cat)
		}

		thumb := ""
		banner := ""
		previewCount := 4
		if len(byViews) < previewCount {
			previewCount = len(byViews)
		}
		if len(byViews) > 0 {
			thumb = "/api/kvtube/thumb/" + byViews[0].ID
			banner = "/api/kvtube/thumb/" + byViews[0].ID + "?q=maxresdefault"
		}

		list = append(list, ChannelInfo{
			Name:         a.name,
			AuthorID:     c.ChannelIDs[a.name],
			Count:        len(a.films),
			TotalViews:   a.views,
			FullCount:    a.fullCount,
			Thumbnail:    thumb,
			Banner:       banner,
			Categories:   cats,
			URL:          "/channel/" + url.PathEscape(a.name),
			PreviewFilms: byViews[:previewCount],
		})
	}

	switch strings.ToLower(sortBy) {
	case "count":
		sort.Slice(list, func(i, j int) bool {
			if list[i].Count != list[j].Count {
				return list[i].Count > list[j].Count
			}
			return list[i].TotalViews > list[j].TotalViews
		})
	case "name":
		sort.Slice(list, func(i, j int) bool {
			return strings.ToLower(list[i].Name) < strings.ToLower(list[j].Name)
		})
	default: // "popular" or default weighted
		sort.Slice(list, func(i, j int) bool {
			if list[i].TotalViews != list[j].TotalViews {
				return list[i].TotalViews > list[j].TotalViews
			}
			return list[i].Count > list[j].Count
		})
	}

	return list
}

// GetChannelDetail resolves a channel by name or YouTube authorId and returns films, playlists, and metadata.
func (c *Catalog) GetChannelDetail(idOrName string, sortBy string, tab string, search string) *ChannelDetail {
	c.mu.RLock()
	defer c.mu.RUnlock()

	target := strings.TrimSpace(idOrName)
	if unesc, err := url.PathUnescape(target); err == nil && unesc != "" {
		target = unesc
	}
	if target == "" {
		return nil
	}

	// Check if target is an AuthorID (UC...)
	resolvedName := ""
	for chName, aid := range c.ChannelIDs {
		if strings.EqualFold(aid, target) || strings.EqualFold(chName, target) {
			resolvedName = chName
			break
		}
	}

	targetNorm := ViNorm(target)
	if resolvedName == "" {
		for _, f := range c.Films {
			if f.Channel != "" && (strings.EqualFold(f.Channel, target) || (targetNorm != "" && f.NormChannel == targetNorm)) {
				resolvedName = f.Channel
				break
			}
		}
	}
	if resolvedName == "" {
		for _, f := range c.Films {
			if f.Channel != "" && targetNorm != "" && strings.Contains(f.NormChannel, targetNorm) {
				resolvedName = f.Channel
				break
			}
		}
	}

	if resolvedName == "" {
		return nil
	}

	var allChFilms []models.Film
	var totalViews int64
	fullCount := 0
	catsMap := make(map[string]int)
	for _, f := range c.Films {
		if c.DeadIDs[f.ID] || f.Channel != resolvedName {
			continue
		}
		allChFilms = append(allChFilms, f)
		totalViews += f.ViewsNum
		if f.IsFull {
			fullCount++
		}
		if f.Cat != "" {
			catsMap[f.Cat]++
		}
	}
	if len(allChFilms) == 0 {
		return nil
	}

	// Sort a copy by views to determine hero thumbnail/banner
	byViews := make([]models.Film, len(allChFilms))
	copy(byViews, allChFilms)
	sort.Slice(byViews, func(i, j int) bool {
		if byViews[i].ViewsNum != byViews[j].ViewsNum {
			return byViews[i].ViewsNum > byViews[j].ViewsNum
		}
		return byViews[i].Rank > byViews[j].Rank
	})

	type catCnt struct {
		cat string
		cnt int
	}
	var cc []catCnt
	for k, v := range catsMap {
		cc = append(cc, catCnt{cat: k, cnt: v})
	}
	sort.Slice(cc, func(i, j int) bool { return cc[i].cnt > cc[j].cnt })
	cats := make([]string, 0, len(cc))
	for _, item := range cc {
		cats = append(cats, item.cat)
	}

	// Filter films by active tab and search query
	qNorm := ViNorm(search)
	var filtered []models.Film
	for _, f := range allChFilms {
		if tab == "full" && !f.IsFull && f.DurMins < 45 {
			continue
		}
		if qNorm != "" && !strings.Contains(f.NormSearch, qNorm) && !strings.Contains(f.NormTitle, qNorm) {
			continue
		}
		filtered = append(filtered, f)
	}

	switch strings.ToLower(sortBy) {
	case "popular", "topview":
		sort.Slice(filtered, func(i, j int) bool {
			if filtered[i].ViewsNum != filtered[j].ViewsNum {
				return filtered[i].ViewsNum > filtered[j].ViewsNum
			}
			return filtered[i].Rank > filtered[j].Rank
		})
	case "oldest":
		sort.Slice(filtered, func(i, j int) bool {
			return filtered[i].Rank < filtered[j].Rank
		})
	default: // "newest"
		sort.Slice(filtered, func(i, j int) bool {
			return filtered[i].Rank > filtered[j].Rank
		})
	}

	// Build channel Playlists from category groupings and multi-part series
	var playlists []ChannelPlaylist
	seenSeries := make(map[string]bool)
	for _, f := range allChFilms {
		eps, exists := c.SeriesByFilm[f.ID]
		if !exists || len(eps) < 2 {
			continue
		}
		sig := eps[0].ID
		if seenSeries[sig] {
			continue
		}
		seenSeries[sig] = true
		playlists = append(playlists, ChannelPlaylist{
			ID:        "series_" + sig,
			Title:     eps[0].Title,
			Count:     len(eps),
			Thumbnail: "/api/kvtube/thumb/" + eps[0].ID,
			Films:     eps,
		})
		if len(playlists) >= 12 {
			break
		}
	}
	if len(playlists) < 4 {
		catGroup := make(map[string][]models.Film)
		for _, f := range allChFilms {
			catKey := f.Cat
			if catKey == "" {
				catKey = "other"
			}
			catGroup[catKey] = append(catGroup[catKey], f)
		}
		for catKey, grp := range catGroup {
			if len(grp) < 2 {
				continue
			}
			playlists = append(playlists, ChannelPlaylist{
				ID:        "cat_" + catKey,
				Title:     "Tuyển tập " + strings.ToUpper(catKey),
				Count:     len(grp),
				Thumbnail: "/api/kvtube/thumb/" + grp[0].ID,
				Films:     grp,
			})
		}
	}

	return &ChannelDetail{
		ChannelInfo: ChannelInfo{
			Name:       resolvedName,
			AuthorID:   c.ChannelIDs[resolvedName],
			Count:      len(allChFilms),
			TotalViews: totalViews,
			FullCount:  fullCount,
			Thumbnail:  "/api/kvtube/thumb/" + byViews[0].ID,
			Banner:     "/api/kvtube/thumb/" + byViews[0].ID + "?q=maxresdefault",
			Categories: cats,
			URL:        "/channel/" + url.PathEscape(resolvedName),
		},
		Films:        filtered,
		Playlists:    playlists,
		TotalMatched: len(filtered),
	}
}

// MarkDead records a video ID discovered at runtime to be private/removed and persists it to dead-runtime.json.
func (c *Catalog) MarkDead(id string) {
	id = strings.TrimSpace(id)
	if id == "" {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.DeadIDs[id] {
		return
	}
	c.DeadIDs[id] = true
	c.rebuildManifestCountsLocked()

	runtimePath := filepath.Join(c.DataDir, "dead-runtime.json")
	var list []string
	if raw, err := os.ReadFile(runtimePath); err == nil {
		_ = json.Unmarshal(raw, &list)
	}
	found := false
	for _, x := range list {
		if x == id {
			found = true
			break
		}
	}
	if !found {
		list = append(list, id)
		if b, err := json.Marshal(list); err == nil {
			_ = os.WriteFile(runtimePath, b, 0644)
		}
	}
}

func paginate(items []models.Film, page, limit int) []models.Film {
	start := (page - 1) * limit
	if start >= len(items) {
		return []models.Film{}
	}
	end := start + limit
	if end > len(items) {
		end = len(items)
	}
	return items[start:end]
}

func safeIdx(s []interface{}, idx int) interface{} {
	if idx >= 0 && idx < len(s) {
		return s[idx]
	}
	return nil
}

func toInt(v interface{}) int {
	switch val := v.(type) {
	case float64:
		return int(val)
	case int:
		return val
	case string:
		n, _ := strconv.Atoi(val)
		return n
	}
	return 0
}

func toString(v interface{}) string {
	switch val := v.(type) {
	case string:
		return val
	case float64:
		return strconv.FormatInt(int64(val), 10)
	case int:
		return strconv.Itoa(val)
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", val)
	}
}

func toStringSlice(v interface{}) []string {
	arr, ok := v.([]interface{})
	if !ok {
		return []string{}
	}
	out := make([]string, 0, len(arr))
	for _, item := range arr {
		if s := toString(item); s != "" {
			out = append(out, s)
		}
	}
	return out
}

func toBool(v interface{}) bool {
	switch val := v.(type) {
	case bool:
		return val
	case float64:
		return val != 0
	case int:
		return val != 0
	case string:
		return val == "1" || strings.EqualFold(val, "true")
	}
	return false
}
