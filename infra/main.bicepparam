using './main.bicep'

param swaName = 'swa-unwordle'
param location = 'italynorth'
param customDomain = 'unwordle.tinyapps.it'
param tags = {
  project: 'unwordle'
  environment: 'production'
}
