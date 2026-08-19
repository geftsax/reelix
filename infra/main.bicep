@description('Lower-case prefix used to build every resource name. 3-11 characters.')
@minLength(3)
@maxLength(11)
param namePrefix string = 'reelix'

@description('Region for all resources. Check availability with Practical 1b before changing.')
param location string = resourceGroup().location

@description('Administrator login for the Azure SQL logical server.')
param sqlAdminLogin string = 'reelixadmin'

@description('Administrator password for the Azure SQL logical server.')
@secure()
@minLength(12)
param sqlAdminPassword string

@description('Secret used to sign API access tokens.')
@secure()
@minLength(24)
param jwtSecret string

@description('Deploy an Azure AI Content Safety account on the free F0 tier.')
param deployContentSafety bool = true

@description('''
Use the Azure SQL free offer (serverless General Purpose with useFreeLimit).
Set to false to fall back to a Standard S0 database instead, which is what the
Azure for Students plan covers under its own 12-month free benefit. Only one
free-offer database is permitted per subscription, so the fallback matters if
that allowance is already spent.
''')
param useSqlFreeOffer bool = true

@description('Blob container that holds the uploaded video files.')
param clipContainerName string = 'clips'

var suffix = uniqueString(resourceGroup().id)
var storageName = toLower('${namePrefix}st${substring(suffix, 0, 8)}')
var sqlServerName = toLower('${namePrefix}-sql-${substring(suffix, 0, 6)}')
var sqlDatabaseName = '${namePrefix}-db'
var planName = '${namePrefix}-plan'
var apiName = '${namePrefix}-api-${substring(suffix, 0, 6)}'
var safetyName = '${namePrefix}-safety-${substring(suffix, 0, 6)}'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'HEAD', 'OPTIONS']
          allowedHeaders: ['*']
          exposedHeaders: ['*']
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

resource clipContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: clipContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: sqlServerName
  location: location
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource allowAzureServices 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

var freeOfferSku = {
  name: 'GP_S_Gen5'
  tier: 'GeneralPurpose'
  family: 'Gen5'
  capacity: 2
}

var studentS0Sku = {
  name: 'S0'
  tier: 'Standard'
  capacity: 10
}

var freeOfferProperties = {
  collation: 'SQL_Latin1_General_CP1_CI_AS'
  maxSizeBytes: 34359738368
  minCapacity: json('0.5')
  autoPauseDelay: 60
  // One free database per subscription.
  useFreeLimit: true
  freeLimitExhaustionBehavior: 'AutoPause'
  zoneRedundant: false
}

var studentS0Properties = {
  collation: 'SQL_Latin1_General_CP1_CI_AS'
  maxSizeBytes: 268435456000
  zoneRedundant: false
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: sqlDatabaseName
  location: location
  sku: useSqlFreeOffer ? freeOfferSku : studentS0Sku
  properties: useSqlFreeOffer ? freeOfferProperties : studentS0Properties
}

resource contentSafety 'Microsoft.CognitiveServices/accounts@2023-10-01-preview' = if (deployContentSafety) {
  name: safetyName
  location: location
  kind: 'ContentSafety'
  sku: {
    name: 'F0'
  }
  properties: {
    customSubDomainName: safetyName
    publicNetworkAccess: 'Enabled'
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  kind: 'linux'
  sku: {
    name: 'F1'
    tier: 'Free'
  }
  properties: {
    reserved: true
  }
}

var storageKey = storage.listKeys().keys[0].value

var webEndpoint = storage.properties.primaryEndpoints.web
var staticSiteOrigin = 'https://${split(webEndpoint, '/')[2]}'

var contentSafetyEndpointValue = deployContentSafety ? contentSafety!.properties.endpoint : ''
var contentSafetyKeyValue = deployContentSafety ? contentSafety!.listKeys().key1 : ''

resource api 'Microsoft.Web/sites@2023-12-01' = {
  name: apiName
  location: location
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      appCommandLine: 'node src/server.js'
      alwaysOn: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      healthCheckPath: '/api/system/health'
      appSettings: [
        { name: 'NODE_ENV', value: 'production' }
        { name: 'APP_NAME', value: 'Reelix' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }

        { name: 'DATA_PROVIDER', value: 'sql' }
        { name: 'SQL_SERVER', value: sqlServer.properties.fullyQualifiedDomainName }
        { name: 'SQL_DATABASE', value: sqlDatabaseName }
        { name: 'SQL_USER', value: sqlAdminLogin }
        { name: 'SQL_PASSWORD', value: sqlAdminPassword }
        { name: 'SQL_ENCRYPT', value: 'true' }

        { name: 'STORAGE_PROVIDER', value: 'azure' }
        { name: 'STORAGE_ACCOUNT', value: storage.name }
        { name: 'STORAGE_KEY', value: storageKey }
        { name: 'STORAGE_CONTAINER', value: clipContainerName }
        { name: 'PLAYBACK_SAS_MINUTES', value: '30' }

        { name: 'JWT_SECRET', value: jwtSecret }
        { name: 'JWT_TTL_SECONDS', value: '28800' }

        { name: 'CONTENT_SAFETY_ENDPOINT', value: contentSafetyEndpointValue }
        { name: 'CONTENT_SAFETY_KEY', value: contentSafetyKeyValue }

        { name: 'CORS_ORIGINS', value: staticSiteOrigin }

        { name: 'MAX_UPLOAD_MB', value: '64' }
        { name: 'CACHE_DASHBOARD_TTL', value: '45' }
        { name: 'CACHE_SEARCH_TTL', value: '30' }
        { name: 'CACHE_LOOKUP_TTL', value: '600' }
      ]
    }
  }
}

output apiUrl string = 'https://${api.properties.defaultHostName}'
output apiName string = api.name
output staticSiteUrl string = storage.properties.primaryEndpoints.web
output storageAccountName string = storage.name
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
output sqlDatabaseName string = sqlDatabaseName
output contentSafetyEndpoint string = contentSafetyEndpointValue
