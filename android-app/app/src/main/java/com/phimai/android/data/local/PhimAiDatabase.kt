package com.phimai.android.data.local

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import com.phimai.android.data.model.Film
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "watch_history")
data class WatchHistoryEntity(
    @PrimaryKey val filmId: String,
    val title: String,
    val channel: String,
    val thumbnailUrl: String,
    val dur: String,
    val cat: String,
    val tool: String,
    val views: String,
    val rank: Int,
    val positionMs: Long,
    val durationMs: Long,
    val watchedAt: Long
) {
    fun toFilm(): Film = Film(
        id = filmId,
        rank = rank,
        title = title,
        channel = channel,
        views = views,
        dur = dur,
        cat = cat,
        tool = tool,
        thumbnailUrl = thumbnailUrl
    )
}

@Entity(tableName = "saved_films")
data class SavedFilmEntity(
    @PrimaryKey val filmId: String,
    val title: String,
    val channel: String,
    val thumbnailUrl: String,
    val dur: String,
    val cat: String,
    val tool: String,
    val views: String,
    val rank: Int,
    val savedAt: Long
) {
    fun toFilm(): Film = Film(
        id = filmId,
        rank = rank,
        title = title,
        channel = channel,
        views = views,
        dur = dur,
        cat = cat,
        tool = tool,
        thumbnailUrl = thumbnailUrl
    )
}

@Entity(tableName = "subscribed_channels")
data class SubscribedChannelEntity(
    @PrimaryKey val name: String,
    val thumbnailUrl: String,
    val filmCount: Int,
    val subscribedAt: Long
)

@Dao
interface WatchHistoryDao {
    @Query("SELECT * FROM watch_history ORDER BY watchedAt DESC LIMIT :limit")
    fun observeAll(limit: Int = 80): Flow<List<WatchHistoryEntity>>

    @Query("SELECT * FROM watch_history WHERE filmId = :filmId LIMIT 1")
    suspend fun getById(filmId: String): WatchHistoryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entry: WatchHistoryEntity)

    @Query("UPDATE watch_history SET positionMs = :posMs, durationMs = :durMs, watchedAt = :watchedAt WHERE filmId = :filmId")
    suspend fun updateProgress(filmId: String, posMs: Long, durMs: Long, watchedAt: Long)

    @Query("DELETE FROM watch_history WHERE filmId = :filmId")
    suspend fun deleteById(filmId: String)

    @Query("DELETE FROM watch_history")
    suspend fun clearAll()
}

@Dao
interface SavedFilmDao {
    @Query("SELECT * FROM saved_films ORDER BY savedAt DESC")
    fun observeAll(): Flow<List<SavedFilmEntity>>

    @Query("SELECT filmId FROM saved_films")
    fun observeIds(): Flow<List<String>>

    @Query("SELECT EXISTS(SELECT 1 FROM saved_films WHERE filmId = :filmId)")
    suspend fun exists(filmId: String): Boolean

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entry: SavedFilmEntity)

    @Query("DELETE FROM saved_films WHERE filmId = :filmId")
    suspend fun deleteById(filmId: String)
}

@Dao
interface SubscribedChannelDao {
    @Query("SELECT * FROM subscribed_channels ORDER BY subscribedAt DESC")
    fun observeAll(): Flow<List<SubscribedChannelEntity>>

    @Query("SELECT name FROM subscribed_channels")
    fun observeNames(): Flow<List<String>>

    @Query("SELECT EXISTS(SELECT 1 FROM subscribed_channels WHERE LOWER(name) = LOWER(:name))")
    suspend fun isSubscribed(name: String): Boolean

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entry: SubscribedChannelEntity)

    @Query("DELETE FROM subscribed_channels WHERE LOWER(name) = LOWER(:name)")
    suspend fun deleteByName(name: String)
}

@Database(
    entities = [
        WatchHistoryEntity::class,
        SavedFilmEntity::class,
        SubscribedChannelEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class PhimAiDatabase : RoomDatabase() {
    abstract fun watchHistoryDao(): WatchHistoryDao
    abstract fun savedFilmDao(): SavedFilmDao
    abstract fun subscribedChannelDao(): SubscribedChannelDao
}
