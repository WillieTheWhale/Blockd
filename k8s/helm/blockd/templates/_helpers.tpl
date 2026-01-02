{{/*
Expand the name of the chart.
*/}}
{{- define "blockd.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "blockd.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "blockd.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "blockd.labels" -}}
helm.sh/chart: {{ include "blockd.chart" . }}
{{ include "blockd.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "blockd.selectorLabels" -}}
app.kubernetes.io/name: {{ include "blockd.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "blockd.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "blockd.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Get the image registry
*/}}
{{- define "blockd.imageRegistry" -}}
{{- if .Values.global.imageRegistry }}
{{- .Values.global.imageRegistry }}/
{{- end }}
{{- end }}

{{/*
Get the image pull policy
*/}}
{{- define "blockd.imagePullPolicy" -}}
{{- default "IfNotPresent" .Values.global.imagePullPolicy }}
{{- end }}

{{/*
Database URL
*/}}
{{- define "blockd.databaseUrl" -}}
{{- printf "postgresql://%s:%s@postgres:5432/%s" .Values.secrets.postgresUser .Values.secrets.postgresPassword .Values.configMap.postgresDb }}
{{- end }}

{{/*
Redis URL
*/}}
{{- define "blockd.redisUrl" -}}
{{- printf "redis://:%s@redis:6379" .Values.secrets.redisPassword }}
{{- end }}

{{/*
RabbitMQ URL
*/}}
{{- define "blockd.rabbitmqUrl" -}}
{{- printf "amqp://%s:%s@rabbitmq:5672/blockd" .Values.secrets.rabbitmqUser .Values.secrets.rabbitmqPassword }}
{{- end }}
