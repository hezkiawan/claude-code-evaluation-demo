package handlers

import (
	"strings"
	"testing"
)

func TestParseCreateNote(t *testing.T) {
	tests := []struct {
		name      string
		body      string
		content   string
		important bool
		wantErr   string
	}{
		{name: "minimal", body: `{"content":"hello"}`, content: "hello"},
		{name: "trims", body: `{"content":"  hi \n"}`, content: "hi"},
		{name: "important", body: `{"content":"x","isImportant":true}`, content: "x", important: true},
		{name: "explicit false", body: `{"content":"x","isImportant":false}`, content: "x"},
		{name: "500 emoji", body: `{"content":"` + strings.Repeat("😀", 500) + `"}`, content: strings.Repeat("😀", 500)},
		{name: "500 after trim", body: `{"content":"  ` + strings.Repeat("a", 500) + `  "}`, content: strings.Repeat("a", 500)},
		{name: "501 chars", body: `{"content":"` + strings.Repeat("a", 501) + `"}`, wantErr: "content must be 1 to 500 characters"},
		{name: "501 emoji", body: `{"content":"` + strings.Repeat("😀", 501) + `"}`, wantErr: "content must be 1 to 500 characters"},
		{name: "missing content", body: `{}`, wantErr: "content is required"},
		{name: "null content", body: `{"content":null}`, wantErr: "content is required"},
		{name: "empty content", body: `{"content":""}`, wantErr: "content must be 1 to 500 characters"},
		{name: "whitespace only", body: `{"content":"   "}`, wantErr: "content must be 1 to 500 characters"},
		{name: "content not string", body: `{"content":42}`, wantErr: "content must be a string"},
		{name: "isImportant string", body: `{"content":"x","isImportant":"true"}`, wantErr: "isImportant must be a boolean"},
		{name: "isImportant number", body: `{"content":"x","isImportant":1}`, wantErr: "isImportant must be a boolean"},
		{name: "isImportant null", body: `{"content":"x","isImportant":null}`, wantErr: "isImportant must be a boolean"},
		{name: "malformed", body: `{"content":`, wantErr: "invalid JSON body"},
		{name: "array body", body: `[]`, wantErr: "invalid JSON body"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			content, important, err := parseCreateNote([]byte(tt.body))
			if tt.wantErr != "" {
				if err == nil || err.Error() != tt.wantErr {
					t.Fatalf("err = %v, want %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if content != tt.content || important != tt.important {
				t.Fatalf("got (%q, %v), want (%q, %v)", content, important, tt.content, tt.important)
			}
		})
	}
}
