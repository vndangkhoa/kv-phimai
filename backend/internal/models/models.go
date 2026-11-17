package models

import "time"

// Film represents a single AI film in the KV-PhimAI 9,220-film catalog.
type Film struct {
	ID           string   `json:"id"`
	Rank         int      `json:"rank"`
	Title        string   `json:"title"`
	Channel      string   `json:"channel"`
	Views        string   `json:"views"`
	Dur          string   `json:"dur"`
	Cat          string   `json:"cat"`
	Tool         string   `json:"tool"`
	Blurb        string   `json:"blurb"`
	BlurbLong    string   `json:"blurbLong,omitempty"`
	Tags         []string `json:"tags"`
	Adult        bool     `json:"adult,omitempty"`
	ThumbnailURL string   `json:"thumbnailUrl"`
	WatchURL     string   `json:"watchUrl"`
	EmbedURL     string   `json:"embedUrl"`
	ChannelURL   string   `json:"channelUrl,omitempty"`
	StreamURL    string   `json:"streamUrl"`

	// Precomputed fields for fast filtering/search (not serialized)
	NormSearch  string `json:"-"`
	NormTitle   string `json:"-"`
	NormChannel string `json:"-"`
	ViewsNum    int64  `json:"-"`
	DurMins     int    `json:"-"`
	IsFull      bool   `json:"-"`
}

// FilmDetail extends Film with series episodes, related films, rating, comments, and KVTube metadata.
type FilmDetail struct {
	Film
	Series       []Film            `json:"series"`
	Episodes     []Film            `json:"episodes"`
	Related      []Film            `json:"related"`
	Rating       RatingStat        `json:"rating"`
	CommentCount int               `json:"commentCount"`
	KVTube       KVTubeStreamBrief `json:"kvtube"`
}

type KVTubeStreamBrief struct {
	ID              string `json:"id"`
	WatchURL        string `json:"watchUrl"`
	EmbedURL        string `json:"embedUrl"`
	ChannelURL      string `json:"channelUrl"`
	ThumbnailURL    string `json:"thumbnailUrl"`
	DirectStreamURL string `json:"directStreamUrl"`
}

type KVTubeStreamItem struct {
	URL          string `json:"url"`
	Quality      string `json:"quality"`
	QualityLabel string `json:"qualityLabel,omitempty"`
	Itag         string `json:"itag,omitempty"`
	Type         string `json:"type"`
	Container    string `json:"container,omitempty"`
	Encoding     string `json:"encoding,omitempty"`
	Height       int    `json:"height,omitempty"`
	Bitrate      int64  `json:"bitrate,omitempty"`
	FPS          int    `json:"fps,omitempty"`
	HasAudio     bool   `json:"hasAudio,omitempty"`
	AudioOnly    bool   `json:"audioOnly,omitempty"`
}

type KVTubeCaption struct {
	Label        string `json:"label"`
	LanguageCode string `json:"languageCode"`
	URL          string `json:"url"`
}

type KVTubeVideoResponse struct {
	ID              string                   `json:"id"`
	Title           string                   `json:"title"`
	Author          string                   `json:"author"`
	AuthorID        string                   `json:"authorId"`
	LengthSeconds   int                      `json:"lengthSeconds"`
	ViewCount       int64                    `json:"viewCount"`
	WatchURL        string                   `json:"watchUrl"`
	EmbedURL        string                   `json:"embedUrl"`
	ChannelURL      string                   `json:"channelUrl"`
	ThumbnailURL    string                   `json:"thumbnailUrl"`
	DirectStreamURL string                   `json:"directStreamUrl"`
	BestAudioURL    string                   `json:"bestAudioUrl,omitempty"`
	HlsURL          string                   `json:"hlsUrl,omitempty"`
	DashURL         string                   `json:"dashUrl,omitempty"`
	Streams         []KVTubeStreamItem       `json:"streams"`
	FormatStreams   []map[string]interface{} `json:"formatStreams,omitempty"`
	AdaptiveFormats []map[string]interface{} `json:"adaptiveFormats,omitempty"`
	Captions        []KVTubeCaption          `json:"captions"`
	Film            *Film                    `json:"film,omitempty"`
	Series          []Film                   `json:"series,omitempty"`
	Related         []Film                   `json:"related,omitempty"`
}

// SQLite Persisted Models

type SiteStatRecord struct {
	Key       string    `gorm:"primaryKey;size:64" json:"key"`
	Value     int64     `json:"value"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type FilmPlayRecord struct {
	FilmID    string    `gorm:"primaryKey;size:32" json:"id"`
	Count     int       `json:"count"`
	WeekCount int       `json:"weekCount"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type RatingRecord struct {
	FilmID    string    `gorm:"primaryKey;size:32" json:"id"`
	StarsSum  int       `json:"s"`
	VoteCount int       `json:"n"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type RatingStat struct {
	S int `json:"s"`
	N int `json:"n"`
}

type CommentRecord struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	FilmID    string    `gorm:"index;size:32" json:"filmId"`
	Name      string    `gorm:"size:120" json:"name"`
	Text      string    `gorm:"size:1000" json:"text"`
	StampSec  int       `json:"s"`
	VIP       bool      `json:"vip"`
	DateStr   string    `gorm:"size:32" json:"d"`
	CreatedAt time.Time `json:"createdAt"`
}

type WallPostRecord struct {
	ID        string    `gorm:"primaryKey;size:64" json:"id"`
	Name      string    `gorm:"size:120" json:"name"`
	Text      string    `gorm:"size:1000" json:"text"`
	Timestamp int64     `gorm:"index" json:"ts"`
	Likes     int       `json:"likes"`
	VIP       bool      `json:"vip,omitempty"`
	ReplyTo   string    `gorm:"size:64;index" json:"replyTo,omitempty"`
	CreatedAt time.Time `json:"-"`
}

type SuggestRecord struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Text      string    `gorm:"size:500" json:"t"`
	DateStr   string    `gorm:"size:32" json:"d"`
	Status    string    `gorm:"size:32" json:"s"`
	CreatedAt time.Time `json:"-"`
}

type WatchRoomRecord struct {
	Code      string    `gorm:"primaryKey;size:16" json:"code"`
	FilmID    string    `gorm:"size:32" json:"filmId"`
	HostName  string    `gorm:"size:120" json:"hostName"`
	TimeSec   float64   `json:"t"`
	Playing   bool      `json:"playing"`
	UpdatedTS int64     `json:"ts"`
	ChatJSON  string    `gorm:"type:text" json:"-"`
	ExpiresAt int64     `gorm:"index" json:"expiresAt"`
	CreatedAt time.Time `json:"-"`
}

type RoomChatMessage struct {
	ID   string `json:"id"`
	Name string `json:"n"`
	Text string `json:"t"`
	Date string `json:"d"`
	TS   int64  `json:"ts"`
}
