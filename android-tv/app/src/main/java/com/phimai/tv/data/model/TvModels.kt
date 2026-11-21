package com.phimai.tv.data.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive

object TvFlexibleStringSerializer : KSerializer<String> {
    override val descriptor = PrimitiveSerialDescriptor("TvFlexStr", PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: String) = encoder.encodeString(value)
    override fun deserialize(decoder: Decoder): String {
        val jd = decoder as? JsonDecoder ?: return decoder.decodeString()
        val el = jd.decodeJsonElement()
        return (el as? JsonPrimitive)?.content ?: el.toString()
    }
}

object TvFlexibleIntSerializer : KSerializer<Int> {
    override val descriptor = PrimitiveSerialDescriptor("TvFlexInt", PrimitiveKind.INT)
    override fun serialize(encoder: Encoder, value: Int) = encoder.encodeInt(value)
    override fun deserialize(decoder: Decoder): Int {
        val jd = decoder as? JsonDecoder ?: return decoder.decodeInt()
        val el = jd.decodeJsonElement() as? JsonPrimitive ?: return 0
        return el.content.toDoubleOrNull()?.toInt() ?: 0
    }
}

object TvFlexibleLongSerializer : KSerializer<Long> {
    override val descriptor = PrimitiveSerialDescriptor("TvFlexLong", PrimitiveKind.LONG)
    override fun serialize(encoder: Encoder, value: Long) = encoder.encodeLong(value)
    override fun deserialize(decoder: Decoder): Long {
        val jd = decoder as? JsonDecoder ?: return decoder.decodeLong()
        val el = jd.decodeJsonElement() as? JsonPrimitive ?: return 0L
        return el.content.toDoubleOrNull()?.toLong() ?: 0L
    }
}

@Serializable
data class TvFilm(
    val id: String = "",
    val rank: Int = 0,
    val title: String = "",
    val channel: String = "",
    @Serializable(with = TvFlexibleStringSerializer::class)
    val views: String = "0",
    val dur: String = "",
    val cat: String = "",
    val tool: String = "AI",
    val blurb: String = "",
    val blurbLong: String = "",
    val tags: List<String> = emptyList(),
    val thumbnailUrl: String = "",
    val watchUrl: String = "",
    val streamUrl: String = "",
    @Transient
    val stackedEpisodes: List<TvFilm> = emptyList()
)

@Serializable
data class TvFilmsPageResponse(
    val items: List<TvFilm> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 60,
    val hasMore: Boolean = false
)

@Serializable
data class TvManifestResponse(
    val adultCount: Int = 0,
    val cats: Map<String, Int> = emptyMap()
)

@Serializable
data class TvHealthResponse(
    val status: String = "",
    val ok: Boolean = false,
    val service: String = "",
    val version: String = "",
    val backendConfigured: Boolean = false,
    val warpActive: Boolean = false,
    val totalFilms: Int = 0,
    val liveFilms: Int = 0
)

@Serializable
data class TvRatingStat(val s: Int = 0, val n: Int = 0) {
    val average: Float get() = if (n > 0) s.toFloat() / n.toFloat() else 0f
}

@Serializable
data class TvFilmDetailResponse(
    val id: String = "",
    val rank: Int = 0,
    val title: String = "",
    val channel: String = "",
    @Serializable(with = TvFlexibleStringSerializer::class)
    val views: String = "0",
    val dur: String = "",
    val cat: String = "",
    val tool: String = "AI",
    val blurb: String = "",
    val blurbLong: String = "",
    val tags: List<String> = emptyList(),
    val thumbnailUrl: String = "",
    val series: List<TvFilm> = emptyList(),
    val episodes: List<TvFilm> = emptyList(),
    val related: List<TvFilm> = emptyList(),
    val rating: TvRatingStat = TvRatingStat(),
    val commentCount: Int = 0
) {
    fun toFilm(): TvFilm = TvFilm(
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
        thumbnailUrl = thumbnailUrl
    )
}

@Serializable
data class TvDiscoverEpisodesResponse(
    val ok: Boolean = false,
    val added: Int = 0,
    val total: Int = 0,
    val episodes: List<TvFilm> = emptyList()
)

@Serializable
data class TvTopWeekEntry(
    val id: String = "",
    val count: Int = 0,
    val film: TvFilm = TvFilm()
)

@Serializable
data class TvTopWeekResponse(
    val week: String = "",
    val top: List<TvTopWeekEntry> = emptyList(),
    val items: List<TvTopWeekEntry> = emptyList()
)

@Serializable
data class TvChannelInfo(
    val name: String = "",
    val count: Int = 0,
    val totalViews: Long = 0L,
    val fullCount: Int = 0,
    val thumbnail: String = "",
    val banner: String = "",
    val categories: List<String> = emptyList(),
    val previewFilms: List<TvFilm> = emptyList()
)

@Serializable
data class TvChannelsResponse(
    val items: List<TvChannelInfo> = emptyList(),
    val total: Int = 0
)

@Serializable
data class TvChannelDetailResponse(
    val name: String = "",
    val count: Int = 0,
    val totalViews: Long = 0L,
    val fullCount: Int = 0,
    val thumbnail: String = "",
    val banner: String = "",
    val films: List<TvFilm> = emptyList()
)

@Serializable
data class TvStreamFormatItem(
    val url: String = "",
    val quality: String = "",
    val qualityLabel: String = "",
    val resolution: String = "",
    @Serializable(with = TvFlexibleStringSerializer::class)
    val itag: String = "",
    val type: String = "",
    @Serializable(with = TvFlexibleIntSerializer::class)
    val height: Int = 0,
    @Serializable(with = TvFlexibleLongSerializer::class)
    val bitrate: Long = 0L,
    @Serializable(with = TvFlexibleIntSerializer::class)
    val fps: Int = 0,
    val audioQuality: String = "",
    val hasAudio: Boolean = false,
    val audioOnly: Boolean = false
)

@Serializable
data class TvVideoStreamPayload(
    val id: String = "",
    val title: String = "",
    val author: String = "",
    val description: String = "",
    @Serializable(with = TvFlexibleIntSerializer::class)
    val lengthSeconds: Int = 0,
    val thumbnailUrl: String = "",
    val directStreamUrl: String = "",
    val bestAudioUrl: String = "",
    val hlsUrl: String = "",
    val dashUrl: String = "",
    val streams: List<TvStreamFormatItem> = emptyList(),
    val formatStreams: List<TvStreamFormatItem> = emptyList(),
    val adaptiveFormats: List<TvStreamFormatItem> = emptyList(),
    val unavailable: Boolean = false,
    val unavailableReason: String = "",
    val film: TvFilm? = null,
    val series: List<TvFilm> = emptyList(),
    val related: List<TvFilm> = emptyList()
)

data class TvQualityOption(
    val id: String,
    val label: String,
    val height: Int,
    val bitrate: Long,
    val url: String,
    val hasAudio: Boolean,
    val mimeType: String
)

@Serializable
data class TvHistoryEntry(
    val film: TvFilm,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val watchedAt: Long = 0L
)

data class TvUpdateInfo(
    val latestVersion: String,
    val downloadUrl: String,
    val releaseNotes: String
)
