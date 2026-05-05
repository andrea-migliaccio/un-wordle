@description('Name of the Azure Static Web App')
param swaName string = 'swa-unwordle'

@description('Azure region for the Static Web App')
param location string = 'westeurope'

@description('Custom domain to attach to the Static Web App')
param customDomain string = 'unwordle.tinyapps.it'

@description('Set to true only after the CNAME record on Aruba DNS is pointing to the SWA default hostname. See infra/README.md section 6.')
param deployCustomDomain bool = false

@description('Tags applied to all resources')
param tags object = {
  project: 'unwordle'
  environment: 'production'
}

// ---------------------------------------------------------------------------
// Static Web App (Free tier)
// ---------------------------------------------------------------------------
resource swa 'Microsoft.Web/staticSites@2023-01-01' = {
  name: swaName
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    buildProperties: {
      skipGithubActionWorkflowGeneration: true
    }
  }
}

// ---------------------------------------------------------------------------
// Custom domain — only deployed after DNS CNAME is in place.
// Step 1: deploy with deployCustomDomain = false (default)
// Step 2: configure DNS on Aruba (see README section 6)
// Step 3: set deployCustomDomain = true in main.bicepparam and redeploy
// ---------------------------------------------------------------------------
resource domain 'Microsoft.Web/staticSites/customDomains@2023-01-01' = if (deployCustomDomain) {
  parent: swa
  name: customDomain
  properties: {}
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
@description('Default hostname of the Static Web App (e.g. swa-unwordle.4.azurestaticapps.net) — use this as the CNAME target on Aruba')
output defaultHostname string = swa.properties.defaultHostname

@description('Resource ID of the Static Web App')
output swaResourceId string = swa.id
