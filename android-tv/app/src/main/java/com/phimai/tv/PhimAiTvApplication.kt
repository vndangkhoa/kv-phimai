package com.phimai.tv

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import com.phimai.tv.data.api.TvPhimAiApi

class PhimAiTvApplication : Application(), ImageLoaderFactory {
    override fun newImageLoader(): ImageLoader =
        ImageLoader.Builder(this)
            .okHttpClient { TvPhimAiApi.okHttp }
            .crossfade(false)
            .build()
}
