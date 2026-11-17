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
	TopWeekMeta  struct {
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
	rePartNum    = regexp.MustCompile(`\b(?:phan|part|tap|ep|episode|chuong|chapter|mua|season|p)\s*(\d+)\b`)
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
		SeriesByFilm: make(map[string][]models.Film),
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
		f.ChannelURL = "/?channel=" + url.QueryEscape(f.Channel)
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

func (c *Catalog) buildSeriesGroups() {
	type groupMember struct {
		film  models.Film
		order int
	}
	groups := make(map[string][]groupMember)

	for _, f := range c.Films {
		if c.DeadIDs[f.ID] {
			continue
		}
		normT := f.NormTitle
		order := 9999
		hasPart := false
		if m := rePartNum.FindStringSubmatch(normT); len(m) >= 2 {
			order, _ = strconv.Atoi(m[1])
			hasPart = true
		} else if strings.Contains(normT, "phan dau") {
			order = 0
			hasPart = true
		} else if strings.Contains(normT, "phan cuoi") {
			order = 999
			hasPart = true
		}

		// Extract base title before "|" or part marker
		segs := strings.FieldsFunc(f.Title, func(r rune) bool {
			return r == '|' || r == '｜' || r == '│' || r == '-' || r == ':'
		})
		base := ""
		for _, s := range segs {
			ns := ViNorm(s)
			ns = rePartNum.ReplaceAllString(ns, "")
			ns = strings.TrimSpace(ns)
			if len(strings.Fields(ns)) >= 3 && ns != f.NormChannel {
				base = ns
				break
			}
		}
		if base == "" {
			continue
		}
		if !hasPart && len(strings.Fields(base)) < 5 {
			continue
		}
		key := base + "||" + f.NormChannel
		groups[key] = append(groups[key], groupMember{film: f, order: order})
	}

	for _, members := range groups {
		if len(members) < 2 || len(members) > 25 {
			continue
		}
		sort.Slice(members, func(i, j int) bool {
			if members[i].order != members[j].order {
				return members[i].order < members[j].order
			}
			return members[i].film.Rank < members[j].film.Rank
		})
		filmSlice := make([]models.Film, len(members))
		for i, m := range members {
			filmSlice[i] = m.film
		}
		for _, m := range members {
			c.SeriesByFilm[m.film.ID] = filmSlice
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
	var out []models.Film
	// First same channel
	for _, cand := range c.Films {
		if cand.ID == f.ID || c.DeadIDs[cand.ID] {
			continue
		}
		if cand.Channel != "" && cand.Channel == f.Channel {
			out = append(out, cand)
			if len(out) >= limit {
				return out
			}
		}
	}
	// Then same category
	for _, cand := range c.Films {
		if cand.ID == f.ID || c.DeadIDs[cand.ID] {
			continue
		}
		if cand.Cat == f.Cat && cand.Channel != f.Channel {
			out = append(out, cand)
			if len(out) >= limit {
				return out
			}
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
