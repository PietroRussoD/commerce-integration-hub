{{- define "hub.labels" -}}
app.kubernetes.io/part-of: commerce-integration-hub
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
{{- end -}}

{{- define "hub.image" -}}
{{ .repository }}:{{ .tag }}
{{- end -}}

{{/* The container security settings shared by every application. */}}
{{- define "hub.containerSecurity" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: [ALL]
{{- end -}}

{{- define "hub.operatorSecurity.validate" -}}
{{- $security := .Values.operatorSecurity -}}
{{- if $security.enabled -}}
  {{- if or (eq $security.issuer "") (eq $security.audience "") (eq $security.coreAuthServerUrl "") (eq $security.gatewayJwksUrl "") -}}
    {{- fail "operatorSecurity.enabled requires issuer, audience, coreAuthServerUrl, and gatewayJwksUrl" -}}
  {{- end -}}
  {{- if or (contains ".invalid" $security.issuer) (contains ".invalid" $security.coreAuthServerUrl) (contains ".invalid" $security.gatewayJwksUrl) -}}
    {{- fail "operatorSecurity URLs must identify the configured external issuer and must not use a .invalid placeholder" -}}
  {{- end -}}
{{- end -}}
{{- end -}}
