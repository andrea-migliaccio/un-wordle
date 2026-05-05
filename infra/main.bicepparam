using './main.bicep'

param swaName = 'swa-unwordle'
param location = 'westeurope'
param customDomain = 'unwordle.tinyapps.it'
param tags = {
  project: 'unwordle'
  environment: 'production'
}
