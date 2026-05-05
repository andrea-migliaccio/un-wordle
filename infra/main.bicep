@description('Name of the Azure Static Web App')
param swaName string = 'swa-unwordle'

@description('Azure region for the Static Web App')
param location string = 'westeurope'

@description('Custom domain to attach to the Static Web App')
param customDomain string = 'unwordle.tinyapps.it'

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
    // GitHub integration is handled by the GitHub Actions workflow,
    // not by Azure's built-in GitHub integration, so we skip repo config here.
    buildProperties: {
      skipGithubActionWorkflowGeneration: true
    }
  }
}

// ---------------------------------------------------------------------------
// Custom domain
// Azure will automatically provision a managed TLS certificate.
// DNS ownership must be verified before this resource can be created
// (see infra/README.md — step "DNS Aruba: verifica ownership").
// ---------------------------------------------------------------------------
resource domain 'Microsoft.Web/staticSites/customDomains@2023-01-01' = {
  parent: swa
  name: customDomain
  properties: {}
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
@description('Default hostname of the Static Web App (e.g. swa-unwordle.4.azurestaticapps.net)')
output defaultHostname string = swa.properties.defaultHostname

@description('Resource ID of the Static Web App')
output swaResourceId string = swa.id
