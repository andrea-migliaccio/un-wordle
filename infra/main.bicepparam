using './main.bicep'

param swaName = 'swa-unwordle'
param location = 'westeurope'
param customDomain = 'unwordle.tinyapps.it'
// Set to true after the CNAME record on Aruba is configured (see README section 6)
param deployCustomDomain = true
param tags = {
  project: 'unwordle'
  environment: 'production'
}
