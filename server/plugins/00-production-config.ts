import { productionConfigIssues } from '../deployment/config'
export default defineNitroPlugin(async () => {
  const config = useRuntimeConfig()
  const issues = productionConfigIssues(config)
  if (issues.length) throw new Error(`Production configuration is incomplete:\n${issues.join('\n')}`)
  if (config.deploymentMode === 'production') {
    const settings = await shopSettings()
    const savedIssues = productionConfigIssues({ ...config, siteUrl: settings.siteUrl })
    if (savedIssues.length) throw new Error('Update the saved website URL in Admin Settings to the public HTTPS origin before deploying.')
  }
})
