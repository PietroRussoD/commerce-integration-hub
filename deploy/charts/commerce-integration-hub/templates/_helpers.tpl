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
