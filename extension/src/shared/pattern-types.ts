// Pattern DB types for site-specific form detection rules

export interface PatternMatch {
  type: 'domain' | 'domain_suffix'
  value: string
  strict_subdomain?: boolean
}

export interface FormCondition {
  url_path?: string
  element_exists?: string
  element_not_exists?: string
}

export interface WaitFor {
  selector: string
  timeout_ms?: number
}

export interface FieldDef {
  selector: string
  fallback_selectors?: string[]
}

export interface PatternForm {
  id: string
  type: string
  condition?: FormCondition
  wait_for?: WaitFor
  fields: Record<string, FieldDef>
  skip_fields?: string[]
}

export interface SitePattern {
  description: string
  match: PatternMatch
  disabled?: boolean
  forms?: PatternForm[]
}
