const fs = require('fs')
const path = require('path')
const webpack = require('webpack')

const glob = require('glob-all')
const AliOssPlugin = require('webpack-oss')
const PurgecssPlugin = require('purgecss-webpack-plugin')
const UglifyJsPlugin = require('uglifyjs-webpack-plugin')
const PrerenderSpaPlugin = require('prerender-spa-plugin')
const CompressionWebpackPlugin = require('compression-webpack-plugin')
const productionGzipExtensions = /\.(js|css|json|txt|html|ico|svg)(\?.*)?$/i
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin

const resolve = dir => path.join(__dirname, dir)
const isProd = ['production', 'prod'].includes(process.env.NODE_ENV)

// 配置Stylus
const addStylusResource = rule => {
  rule
    .use('style-resouce')
    .loader('style-resources-loader')
    .options({
      patterns: [resolve('src/assets/stylus/variable.styl')]
    })
}

// 雪碧图
const SpritesmithPlugin = require('webpack-spritesmith')
let spriteImage = true
try {
  let result = fs.readFileSync(path.resolve(__dirname, './icons.json'), 'utf8')
  result = JSON.parse(result)
  const files = fs.readdirSync(path.resolve(__dirname, './src/assets/icons'))
  if (files && files.length) {
    const isExist = files.some(item => {
      const file = item.toLocaleLowerCase().replace(/_/g, '-')
      return !result[file]
    })
    spriteImage = isExist ? true : false
  } else {
    spriteImage = false
  }
} catch (error) {
  console.log(error)
}
// 雪碧图样式处理模板
const SpritesmithTemplate = function(data) {
  let icons = {}
  let tpl = `.ico {
    display: inline-block;
    background-image: url(${data.sprites[0].image});
    background-size: ${data.spritesheet.width}px ${data.spritesheet.height}px;
  }`

  data.sprites.forEach(sprite => {
    const name = '' + sprite.name.toLocaleLowerCase().replace(/_/g, '-')
    icons[`${name}.png`] = true
    tpl = `${tpl} .ico-${name} {
            width: ${sprite.width}px;
            height: ${sprite.height}px;
            background-position: ${sprite.offset_x}px ${sprite.offset_y}px;
          }`
  })

  fs.writeFile(path.resolve(__dirname, './icons.json'), JSON.stringify(icons, null, 2), (err, data) => {})
  return tpl
}

module.exports = {
  publicPath: isProd ? process.env.VUE_APP_PUBLIC_PATH : './',
  outputDir: 'dist',
  assetsDir: 'static',
  configureWebpack: config => {
    const plugins = []
    config.externals = {
      vue: 'Vue',
      vuex: 'Vuex',
      axios: 'axios',
      'element-ui': 'ELEMENT',
      'vue-router': 'VueRouter'
    }
    if (isProd) {
      // 移除无效CSS
      plugins.push(
        new PurgecssPlugin({
          paths: glob.sync([resolve('./**/*.vue')]),
          whitelist: ['html', 'body'],
          whitelistPatterns: [/el-.*/],
          whitelistPatternsChildren: [/^token/, /^pre/, /^code/],
          extractors: [
            {
              extractor: class Extractor {
                static extract(content) {
                  const validSection = content.replace(/<style([\s\S]*?)<\/style>+/gim, '')
                  return validSection.match(/[A-Za-z0-9-_:/]+/g) || []
                }
              },
              extensions: ['html', 'vue']
            }
          ]
        })
      )
      // 移除打印console.log
      plugins.push(
        new UglifyJsPlugin({
          uglifyOptions: {
            warnings: false,
            compress: {
              drop_console: true,
              drop_debugger: false,
              pure_funcs: ['console.log']
            }
          },
          sourceMap: false,
          parallel: true
        })
      )
      // 分割代码块
      config.optimization = {
        splitChunks: {
          cacheGroups: {
            elementUI: {
              name: 'chunk-element',
              chunks: 'all',
              priority: 20,
              test: /[\\/]node_modules[\\/]element-ui[\\/]/
            },
            libs: {
              name: 'chunk-libs',
              chunks: 'initial',
              priority: 10,
              test: /[\\/]node_modules[\\/]/
            }
          }
        }
      }
      // Gzip压缩
      plugins.push(
        new CompressionWebpackPlugin({
          filename: '[path].gz[query]',
          algorithm: 'gzip',
          test: productionGzipExtensions,
          threshold: 10240,
          minRatio: 0.8
        })
      )
      // 页面预渲染
      plugins.push(
        new PrerenderSpaPlugin({
          staticDir: resolve('dist'),
          routes: ['/'],
          postProcess(ctx) {
            ctx.route = ctx.originalRoute
            ctx.html = ctx.html.split(/>[\s]+</gim).join('><')
            if (ctx.route.endsWith('.html')) {
              ctx.outputPath = path.join(__dirname, 'dist', ctx.route)
            }
            return ctx
          },
          minify: {
            collapseBooleanAttributes: true,
            collapseWhitespace: true,
            decodeEntities: true,
            keepClosingSlash: true,
            sortAttributes: true
          },
          renderer: new PrerenderSpaPlugin.PuppeteerRenderer({
            // 通过注入检测当前页面是否预渲染
            inject: {},
            headless: false,
            // 在页面渲染完成后执行
            renderAfterDocumentEvent: 'render-event'
          })
        })
      )
      // OSS文件上传
      plugins.push(
        new AliOssPlugin({
          accessKeyId: process.env.ACCESS_KEY_ID,
          accessKeySecret: process.env.ACCESS_KEY_SECRET,
          region: process.env.REGION,
          bucket: process.env.BUCKET,
          prefix: process.env.PREFIX,
          exclude: /.*\.html$/,
          deleteAll: false
        })
      )
    }
    // 配置雪碧图
    if (spriteImage) {
      plugins.push(
        new SpritesmithPlugin({
          src: {
            cwd: path.resolve(__dirname, './src/assets/icons/'), // 图标根目录
            glob: '**/*.png' // 匹配PNG格式
          },
          target: {
            image: path.resolve(__dirname, './src/assets/images/sprites.png'), // 雪碧图生成路径
            css: [
              [
                path.resolve(__dirname, './src/assets/scss/sprites.scss'), // 雪碧图背景样式文件路径
                {
                  format: 'function_based_template' // 雪碧图背景定位生成方式
                }
              ]
            ]
          },
          customTemplates: {
            function_based_template: SpritesmithTemplate
          },
          apiOptions: {
            cssImageRef: '../images/sprites.png' // CSS文件中引用雪碧图的相对路径
          },
          spritesmithOptions: {
            padding: 2
          }
        })
      )
    }

    config.plugins = [...config.plugins, ...plugins]
  },
  chainWebpack: config => {
    const cdn = {
      css: ['//unpkg.com/element-ui@2.10.1/lib/theme-chalk/index.css'],
      js: [
        '//unpkg.com/vue@2.6.10/dist/vue.min.js',
        '//unpkg.com/vuex@3.1.1/dist/vuex.min.js',
        '//unpkg.com/axios@0.19.0/dist/axios.min.js',
        '//unpkg.com/element-ui@2.10.1/lib/index.js',
        '//unpkg.com/vue-router@3.0.6/dist/vue-router.min.js'
      ]
    }
    // 修复热更新
    config.resolve.symlinks(true)
    // 修复路由加载循环依赖(Lazy loading routes Error：Cyclic dependency)
    config.plugin('html').tap(args => {
      args[0].chunksSortMode = 'none'
      args[0].cdn = cdn
      return args
    })
    // 添加别名
    config.resolve.alias
      .set('@', resolve('src'))
      .set('@assets', resolve('src/assets'))
      .set('@components', resolve('src/components'))
    // 添加图片压缩
    config.module
      .rule('images')
      .use('image-webpack-loader')
      .loader('image-webpack-loader')
      .options({
        mozjpeg: { progressive: true, quality: 65 },
        optipng: { enabled: false },
        pngquant: { quality: '65-90', speed: 4 },
        gifsicle: { interlaced: false },
        webp: { quality: 75 }
      })
    // 添加打包分析
    if (process.env.IS_ANALYZ) {
      config.plugin('webpack-report').use(BundleAnalyzerPlugin, [
        {
          analyzerMode: 'static'
        }
      ])
    }
    // 删除Moment多余语言包
    config.plugin('ignore').use(new webpack.ContextReplacementPlugin(/moment[/\\]locale$/, /zh-cn$/))
    // 配置全局Stylus样式
    const types = ['vue-modules', 'vue', 'normal-modules', 'normal']
    types.forEach(type => addStylusResource(config.module.rule('stylus').oneOf(type)))

    return config
  },
  css: {
    modules: false,
    extract: isProd,
    sourceMap: false,
    loaderOptions: {
      sass: {
        // 引入全局SASS样式, $src配置图片CDN前缀
        data: `
        @import "@scss/config.scss";
        @import "@scss/variables.scss";
        @import "@scss/mixins.scss";
        @import "@scss/utils.scss";
        $src: "${process.env.VUE_APP_OSS_SRC}";
        `
      }
    }
  },
  transpileDependencies: [],
  lintOnSave: false,
  runtimeCompiler: true, // 是否使用包含运行时编译器的 Vue 构建版本
  productionSourceMap: !isProd, // 生产环境的 source map
  parallel: require('os').cpus().length > 1,
  pwa: {},
  devServer: {
    open: true, // 打开浏览器
    host: 'localhost',
    port: '8080',
    https: false,
    hotOnly: false, // 热更新
    // 警告错误提示
    overlay: {
      warnings: false,
      errors: true
    },
    proxy: {
      '/api': {
        target: 'https://www.easy-mock.com/mock/5bc75b55dc36971c160cad1b/sheets', // 代理接口地址
        changeOrigin: true, // 开启本地代理
        secure: false,
        ws: true, // 开启Websocket
        pathRewrite: {
          '^/api': '/'
        }
      }
    }
  }
}
