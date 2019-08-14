const isProd = ['production', 'prod'].includes(process.env.NODE_ENV)

const plugins = []
if (isProd) {
  plugins.push('transform-remove-console')
}

module.exports = {
  presets: [['@vue/app', { useBuiltIns: 'entry' }]],
  plugins
}
