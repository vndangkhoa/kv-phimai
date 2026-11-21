package com.phimai.android.data.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive

object FlexibleStringSerializer : KSerializer<String> {
    override val descriptor = PrimitiveSerialDescriptor("FlexibleString", PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: String) = encoder.encodeString(value)
    override fun deserialize(decoder: Decoder): String {
        val jsonDecoder = decoder as? JsonDecoder ?: return decoder.decodeString()
        val elem = jsonDecoder.decodeJsonElement()
        return (elem as? JsonPrimitive)?.content ?: elem.toString()
    }
}

object FlexibleLongSerializer : KSerializer<Long> {
    override val descriptor = PrimitiveSerialDescriptor("FlexibleLong", PrimitiveKind.LONG)
    override fun serialize(encoder: Encoder, value: Long) = encoder.encodeLong(value)
    override fun deserialize(decoder: Decoder): Long {
        val jsonDecoder = decoder as? JsonDecoder ?: return decoder.decodeLong()
        val elem = jsonDecoder.decodeJsonElement() as? JsonPrimitive ?: return 0L
        return elem.content.toDoubleOrNull()?.toLong() ?: 0L
    }
}

object FlexibleIntSerializer : KSerializer<Int> {
    override val descriptor = PrimitiveSerialDescriptor("FlexibleInt", PrimitiveKind.INT)
    override fun serialize(encoder: Encoder, value: Int) = encoder.encodeInt(value)
    override fun deserialize(decoder: Decoder): Int {
        val jsonDecoder = decoder as? JsonDecoder ?: return decoder.decodeInt()
        val elem = jsonDecoder.decodeJsonElement() as? JsonPrimitive ?: return 0
        return elem.content.toDoubleOrNull()?.toInt() ?: 0
    }
}

@Serializable
data class Film(
    val id: String = "",
    val rank: Int = 0,
    val title: String = "",
    val channel: String = "",
    @Serializable(with = FlexibleStringSerializer::class)
    val views: String = "0",
    val dur: String = "",
    val cat: String = "",
    val tool: String = "AI",
    val blurb: String = "",
    val blurbLong: String = "",
    val tags: List<String> = emptyList(),
    val adult: Boolean = false,
    val thumbnailUrl: String = "",
    val watchUrl: String = "",
    val embedUrl: String = "",
    val channelUrl: String = "",
    val streamUrl: String = "",
    @Transient
    val stackedEpisodes: List<Film> = emptyList()
)

@Serializable
data class FilmsPageResponse(
    val items: List<Film> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 60,
    val hasMore: Boolean = false,
    val query: String = ""
)

@Serializable
data class ManifestResponse(
    val adultCount: Int = 0,
    val cats: Map<String, Int> = emptyMap()
)

@Serializable
data class HealthResponse(
    val status: String = "",
    val ok: Boolean = false,
    val service: String = "",
    val version: String = "",
    val backendConfigured: Boolean = false,
    val warpActive: Boolean = false,
    val totalFilms: Int = 0,
    val liveFilms: Int = 0,
    val totalCrawled: Int = 0
)

@Serializable
data class StatsResponse(
    val ok: Boolean = false,
    val online: Int = 0,
    val visits: Long = 0,
    val plays: Long = 0,
    val totalFilms: Int = 0,
    val newWeek: Int = 0
)

@Serializable
data class RatingStat(
    val s: Int = 0,
    val n: Int = 0
) {
    val average: Float
        get() = if (n > 0) s.toFloat() / n.toFloat() else 0f
}

@Serializable
data class FilmDetailResponse(
    val id: String = "",
    val rank: Int = 0,
    val title: String = "",
    val channel: String = "",
    @Serializable(with = FlexibleStringSerializer::class)
    val views: String = "0",
    val dur: String = "",
    val cat: String = "",
    val tool: String = "AI",
    val blurb: String = "",
    val blurbLong: String = "",
    val tags: List<String> = emptyList(),
    val adult: Boolean = false,
    val thumbnailUrl: String = "",
    val watchUrl: String = "",
    val embedUrl: String = "",
    val channelUrl: String = "",
    val streamUrl: String = "",
    val series: List<Film> = emptyList(),
    val episodes: List<Film> = emptyList(),
    val related: List<Film> = emptyList(),
    val rating: RatingStat = RatingStat(),
    val commentCount: Int = 0
) {
    fun toFilm(): Film = Film(
        id = id,
        rank = rank,
        title = title,
        channel = channel,
        views = views,
        dur = dur,
        cat = cat,
        tool = tool,
        blurb = blurb,
        blurbLong = blurbLong,
        tags = tags,
        adult = adult,
        thumbnailUrl = thumbnailUrl,
        watchUrl = watchUrl,
        embedUrl = embedUrl,
        channelUrl = channelUrl,
        streamUrl = streamUrl
    )
}

@Serializable
data class DiscoverEpisodesResponse(
    val ok: Boolean = false,
    val id: String = "",
    val added: Int = 0,
    val total: Int = 0,
    val episodes: List<Film> = emptyList()
)

@Serializable
data class TopWeekEntry(
    val id: String = "",
    val count: Int = 0,
    val film: Film = Film()
)

@Serializable
data class TopWeekResponse(
    val week: String = "",
    val top: List<TopWeekEntry> = emptyList(),
    val items: List<TopWeekEntry> = emptyList(),
    val plays: Long = 0
)

@Serializable
data class ChannelInfo(
    val name: String = "",
    val count: Int = 0,
    val totalViews: Long = 0L,
    val fullCount: Int = 0,
    val thumbnail: String = "",
    val banner: String = "",
    val categories: List<String> = emptyList(),
    val url: String = "",
    val previewFilms: List<Film> = emptyList()
)

@Serializable
data class ChannelsResponse(
    val items: List<ChannelInfo> = emptyList(),
    val total: Int = 0
)

@Serializable
data class ChannelPlaylist(
    val name: String = "",
    val key: String = "",
    val count: Int = 0,
    val thumbnail: String = "",
    val films: List<Film> = emptyList()
)

@Serializable
data class ChannelDetailResponse(
    val name: String = "",
    val count: Int = 0,
    val totalViews: Long = 0L,
    val fullCount: Int = 0,
    val thumbnail: String = "",
    val banner: String = "",
    val categories: List<String> = emptyList(),
    val url: String = "",
    val films: List<Film> = emptyList(),
    val playlists: List<ChannelPlaylist> = emptyList(),
    val totalMatched: Int = 0
)

@Serializable
data class StreamFormatItem(
    val url: String = "",
    val quality: String = "",
    val qualityLabel: String = "",
    val resolution: String = "",
    @Serializable(with = FlexibleStringSerializer::class)
    val itag: String = "",
    val type: String = "",
    val container: String = "",
    val encoding: String = "",
    @Serializable(with = FlexibleIntSerializer::class)
    val height: Int = 0,
    @Serializable(with = FlexibleLongSerializer::class)
    val bitrate: Long = 0L,
    @Serializable(with = FlexibleIntSerializer::class)
    val fps: Int = 0,
    val audioQuality: String = "",
    val hasAudio: Boolean = false,
    val audioOnly: Boolean = false
)

@Serializable
data class VideoCaptionItem(
    val label: String = "",
    val languageCode: String = "",
    val url: String = ""
)

@Serializable
data class VideoStreamPayload(
    val id: String = "",
    val title: String = "",
    val author: String = "",
    val authorId: String = "",
    val description: String = "",
    @Serializable(with = FlexibleIntSerializer::class)
    val lengthSeconds: Int = 0,
    @Serializable(with = FlexibleLongSerializer::class)
    val viewCount: Long = 0L,
    val watchUrl: String = "",
    val embedUrl: String = "",
    val channelUrl: String = "",
    val thumbnailUrl: String = "",
    val directStreamUrl: String = "",
    val bestAudioUrl: String = "",
    val hlsUrl: String = "",
    val dashUrl: String = "",
    val streams: List<StreamFormatItem> = emptyList(),
    val formatStreams: List<StreamFormatItem> = emptyList(),
    val adaptiveFormats: List<StreamFormatItem> = emptyList(),
    val captions: List<VideoCaptionItem> = emptyList(),
    val unavailable: Boolean = false,
    val unavailableReason: String = "",
    val film: Film? = null,
    val series: List<Film> = emptyList(),
    val related: List<Film> = emptyList()
)

data class QualityOption(
    val id: String,
    val label: String,
    val height: Int,
    val itag: String = "",
    val fps: Int = 0,
    val bitrate: Long = 0L,
    val url: String,
    val hasAudio: Boolean,
    val mimeType: String = ""
)

enum class QualityTier(val maxHeight: Int, val label: String) {
    AUTO(0, "Tự động"),
    UHD_4K(2160, "2160p (4K)"),
    QHD_2K(1440, "1440p (2K)"),
    FHD_1080(1080, "1080p Full HD"),
    HD_720(720, "720p HD"),
    SD_480(480, "480p"),
    LOW_360(360, "360p");

    companion object {
        fun fromStored(name: String?): QualityTier =
            entries.firstOrNull { it.name.equals(name, ignoreCase = true) } ?: AUTO
    }
}

@Serializable
data class CommentItem(
    val id: Long = 0L,
    val filmId: String = "",
    val name: String = "",
    val text: String = "",
    val s: Int = 0,
    val d: String = "",
    val vip: Boolean = false,
    val ts: Long = 0L
)

@Serializable
data class CommentsResponse(
    val ok: Boolean = false,
    val items: List<CommentItem> = emptyList()
)

@Serializable
data class PostCommentResponse(
    val ok: Boolean = false,
    val item: CommentItem? = null
)

@Serializable
data class RateResponse(
    val ok: Boolean = false,
    val id: String = "",
    val rating: RatingStat = RatingStat()
)

data class UpdateInfo(
    val latestVersion: String,
    val downloadUrl: String,
    val releaseNotes: String
)
