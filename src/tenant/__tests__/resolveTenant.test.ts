import { describe, it, expect } from 'vitest'
import { isCustomDomain, extractSlugFromHostname } from '../resolveTenant'

describe('resolveTenant', () => {
  describe('extractSlugFromHostname', () => {
    it('should resolve standard subdomains', () => {
      expect(extractSlugFromHostname('alliedit.servicefy.app')).toBe('alliedit')
      expect(extractSlugFromHostname('alliedit.flowfy.app')).toBe('alliedit')
    })

    it('should resolve subdomains on localhost', () => {
      expect(extractSlugFromHostname('alliedit.localhost')).toBe('alliedit')
    })

    it('should return null for base domains', () => {
      expect(extractSlugFromHostname('servicefy.app')).toBeNull()
      expect(extractSlugFromHostname('www.servicefy.app')).toBeNull()
      expect(extractSlugFromHostname('localhost')).toBeNull()
    })

    it('should return null for reserved subdomains', () => {
      expect(extractSlugFromHostname('www.servicefy.app')).toBeNull()
      expect(extractSlugFromHostname('admin.servicefy.app')).toBeNull()
      expect(extractSlugFromHostname('api.servicefy.app')).toBeNull()
    })
  })

  describe('isCustomDomain', () => {
    it('should return false for base and reserved domains', () => {
      expect(isCustomDomain('servicefy.app')).toBe(false)
      expect(isCustomDomain('www.servicefy.app')).toBe(false)
      expect(isCustomDomain('flowfy.app')).toBe(false)
      expect(isCustomDomain('localhost')).toBe(false)
      expect(isCustomDomain('127.0.0.1')).toBe(false)
    })

    it('should return false for vercel deployment domains', () => {
      expect(isCustomDomain('servicefy-prod-1234.vercel.app')).toBe(false)
      expect(isCustomDomain('servicefy.vercel.app')).toBe(false)
    })

    it('should return true for custom domains', () => {
      expect(isCustomDomain('alliedit.com.br')).toBe(true)
      expect(isCustomDomain('suporte.alliedit.com.br')).toBe(true)
      expect(isCustomDomain('my-custom-helpdesk.com')).toBe(true)
    })
  })
})
