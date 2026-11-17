package database

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"time"

	"phimai-backend/internal/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func InitDB(dsn string, dataDir string) *gorm.DB {
	if dir := filepath.Dir(dsn); dir != "" && dir != "." {
		_ = os.MkdirAll(dir, 0755)
	}

	var err error
	DB, err = gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		log.Fatalf("Failed to connect to SQLite database (%s): %v", dsn, err)
	}

	err = DB.AutoMigrate(
		&models.SiteStatRecord{},
		&models.FilmPlayRecord{},
		&models.RatingRecord{},
		&models.CommentRecord{},
		&models.WallPostRecord{},
		&models.SuggestRecord{},
		&models.WatchRoomRecord{},
	)
	if err != nil {
		log.Fatalf("Failed to migrate SQLite schema: %v", err)
	}

	seedFromDataDir(DB, dataDir)
	return DB
}

func seedFromDataDir(db *gorm.DB, dataDir string) {
	// 1. Seed site stats (visits, plays)
	var statCount int64
	db.Model(&models.SiteStatRecord{}).Count(&statCount)
	if statCount == 0 {
		db.Create(&models.SiteStatRecord{Key: "visits", Value: 6498, UpdatedAt: time.Now()})
		db.Create(&models.SiteStatRecord{Key: "plays", Value: 4436, UpdatedAt: time.Now()})
		db.Create(&models.SiteStatRecord{Key: "week_plays", Value: 948, UpdatedAt: time.Now()})
	}

	// 2. Seed hot.json & topweek.json into FilmPlayRecord
	var playCount int64
	db.Model(&models.FilmPlayRecord{}).Count(&playCount)
	if playCount == 0 {
		hotMap := map[string]int{}
		if raw, err := os.ReadFile(filepath.Join(dataDir, "hot.json")); err == nil {
			var parsed struct {
				Counts map[string]int `json:"counts"`
			}
			if json.Unmarshal(raw, &parsed) == nil {
				for id, c := range parsed.Counts {
					hotMap[id] = c
				}
			}
		}

		weekMap := map[string]int{}
		if raw, err := os.ReadFile(filepath.Join(dataDir, "topweek.json")); err == nil {
			var parsed struct {
				Top []struct {
					ID    string `json:"id"`
					Count int    `json:"count"`
				} `json:"top"`
			}
			if json.Unmarshal(raw, &parsed) == nil {
				for _, item := range parsed.Top {
					weekMap[item.ID] = item.Count
					if hotMap[item.ID] < item.Count {
						hotMap[item.ID] = item.Count
					}
				}
			}
		}

		var records []models.FilmPlayRecord
		now := time.Now()
		for id, c := range hotMap {
			records = append(records, models.FilmPlayRecord{
				FilmID:    id,
				Count:     c,
				WeekCount: weekMap[id],
				UpdatedAt: now,
			})
		}
		if len(records) > 0 {
			db.CreateInBatches(records, 200)
		}
	}

	// 3. Seed ratings.json
	var ratingCount int64
	db.Model(&models.RatingRecord{}).Count(&ratingCount)
	if ratingCount == 0 {
		if raw, err := os.ReadFile(filepath.Join(dataDir, "ratings.json")); err == nil {
			var parsed struct {
				Ratings map[string]models.RatingStat `json:"ratings"`
			}
			if json.Unmarshal(raw, &parsed) == nil {
				now := time.Now()
				for id, st := range parsed.Ratings {
					db.Create(&models.RatingRecord{
						FilmID:    id,
						StarsSum:  st.S,
						VoteCount: st.N,
						UpdatedAt: now,
					})
				}
			}
		}
	}

	// 4. Seed comment-counts.json with initial sample comments
	var cmtCount int64
	db.Model(&models.CommentRecord{}).Count(&cmtCount)
	if cmtCount == 0 {
		if raw, err := os.ReadFile(filepath.Join(dataDir, "comment-counts.json")); err == nil {
			var parsed struct {
				Counts map[string]int `json:"counts"`
			}
			if json.Unmarshal(raw, &parsed) == nil {
				sampleComments := []string{
					"Phim cuốn quá, hình ảnh AI làm mượt thật sự!",
					"Thuyết minh dễ nghe, cốt truyện bánh cuốn từ đầu tới cuối.",
					"Cày một mạch hết luôn, mong kênh ra thêm phần mới!",
				}
				sampleNames := []string{"Mọt Phim AI", "Khán giả quen", "Fan cứng"}
				idx := 0
				for id, cnt := range parsed.Counts {
					for i := 0; i < cnt; i++ {
						db.Create(&models.CommentRecord{
							FilmID:    id,
							Name:      sampleNames[idx%len(sampleNames)],
							Text:      sampleComments[idx%len(sampleComments)],
							StampSec:  (i + 1) * 120,
							VIP:       i == 0,
							DateStr:   "2026-11-16",
							CreatedAt: time.Now().Add(-time.Duration(idx+1) * time.Hour),
						})
						idx++
					}
				}
			}
		}
	}

	// 5. Seed wall.json
	var wallCount int64
	db.Model(&models.WallPostRecord{}).Count(&wallCount)
	if wallCount == 0 {
		if raw, err := os.ReadFile(filepath.Join(dataDir, "wall.json")); err == nil {
			var parsed struct {
				Posts []struct {
					ID      string `json:"id"`
					Name    string `json:"name"`
					Text    string `json:"text"`
					TS      int64  `json:"ts"`
					Likes   int    `json:"likes"`
					VIP     bool   `json:"vip"`
					ReplyTo string `json:"replyTo"`
				} `json:"posts"`
			}
			if json.Unmarshal(raw, &parsed) == nil {
				for _, p := range parsed.Posts {
					db.Create(&models.WallPostRecord{
						ID:        p.ID,
						Name:      p.Name,
						Text:      p.Text,
						Timestamp: p.TS,
						Likes:     p.Likes,
						VIP:       p.VIP,
						ReplyTo:   p.ReplyTo,
						CreatedAt: time.UnixMilli(p.TS),
					})
				}
			}
		}
	}

	// 6. Seed suggest.json
	var sgCount int64
	db.Model(&models.SuggestRecord{}).Count(&sgCount)
	if sgCount == 0 {
		if raw, err := os.ReadFile(filepath.Join(dataDir, "suggest.json")); err == nil {
			var parsed struct {
				Items []struct {
					T string `json:"t"`
					D string `json:"d"`
					S string `json:"s"`
				} `json:"items"`
			}
			if json.Unmarshal(raw, &parsed) == nil {
				for _, it := range parsed.Items {
					status := it.S
					if status == "" {
						status = "pending"
					}
					db.Create(&models.SuggestRecord{
						Text:      it.T,
						DateStr:   it.D,
						Status:    status,
						CreatedAt: time.Now(),
					})
				}
			}
		}
	}

	// 7. Seed screening Watch Party room from screening.json
	if raw, err := os.ReadFile(filepath.Join(dataDir, "screening.json")); err == nil {
		var parsed struct {
			Screening struct {
				FilmID   string `json:"filmId"`
				RoomCode string `json:"roomCode"`
			} `json:"screening"`
		}
		if json.Unmarshal(raw, &parsed) == nil && parsed.Screening.RoomCode != "" {
			var existing models.WatchRoomRecord
			if db.Where("code = ?", parsed.Screening.RoomCode).First(&existing).Error != nil {
				initChat, _ := json.Marshal([]models.RoomChatMessage{
					{
						ID:   "welcome-1",
						Name: "Rạp Chiếu Chung",
						Text: "Chào mừng các bạn đến với phòng chiếu chung thứ 7 hàng tuần!",
						Date: "20:00",
						TS:   time.Now().UnixMilli(),
					},
				})
				db.Create(&models.WatchRoomRecord{
					Code:      parsed.Screening.RoomCode,
					FilmID:    parsed.Screening.FilmID,
					HostName:  "KV-PhimAI Cinema",
					TimeSec:   0,
					Playing:   true,
					UpdatedTS: time.Now().UnixMilli(),
					ChatJSON:  string(initChat),
					ExpiresAt: time.Now().Add(7 * 24 * time.Hour).UnixMilli(),
					CreatedAt: time.Now(),
				})
			}
		}
	}
}
