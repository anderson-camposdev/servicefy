import { describe, expect, it } from 'vitest'
import workflowBuilderSource from '../WorkflowBuilder.tsx?raw'
import channelConnectionsSource from '../ChannelConnectionsSettings.tsx?raw'
import channelRoutingSource from '../ChannelRoutingSettings.tsx?raw'
import loginIntegrationSource from '../LoginIntegrationSettings.tsx?raw'
import virtualAgentSource from '../VirtualAgentAdmin.tsx?raw'
import analystCockpitSource from '../AnalystCockpit.tsx?raw'
import knowledgeAdminSource from '../KnowledgeAdmin.tsx?raw'

describe('contrato visual das superfícies operacionais', () => {
  it('mantém o construtor de workflows responsivo e sem gradientes decorativos', () => {
    expect(workflowBuilderSource).toContain('servicefy-workflow-shell')
    expect(workflowBuilderSource).toContain('servicefy-workflow-sidebar')
    expect(workflowBuilderSource).not.toMatch(/bg-gradient-to-|from-indigo-|to-indigo-/)
  })

  it('usa os tokens de produto nas configurações de canais e agente virtual', () => {
    const surfaces = [
      channelConnectionsSource,
      channelRoutingSource,
      loginIntegrationSource,
      virtualAgentSource,
    ]

    for (const source of surfaces) {
      expect(source).not.toMatch(/text-indigo-6\d\d|bg-gradient-to-|from-indigo-|to-indigo-/)
    }
  })

  it('mantém todas as abas do cockpit legíveis sem overflow no mobile', () => {
    expect(analystCockpitSource).toContain('compactLabel')
    expect(analystCockpitSource).toContain('sm:hidden')
    expect(analystCockpitSource).toContain('hidden sm:inline')
  })

  it('encurta a navegação editorial da base no mobile sem perder o rótulo completo', () => {
    expect(knowledgeAdminSource).toContain("k === 'relations' ? `Vínculos")
    expect(knowledgeAdminSource).toContain('hidden sm:inline')
  })
})
