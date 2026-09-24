package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"

	firebase "firebase.google.com/go/v4"
	"google.golang.org/api/option"

	"mini-kouventa/backend/handlers"
)

const allowedOrigin = "http://localhost:3000"

func main() {
	ctx := context.Background()

	credPath := os.Getenv("SERVICE_ACCOUNT_PATH")
	if credPath == "" {
		credPath = "serviceAccountKey.json"
	}
	if _, err := os.Stat(credPath); err != nil {
		log.Fatalf("service account key not found at %q: %v", credPath, err)
	}

	app, err := firebase.NewApp(ctx, nil, option.WithCredentialsFile(credPath))
	if err != nil {
		log.Fatalf("init firebase app: %v", err)
	}
	fs, err := app.Firestore(ctx)
	if err != nil {
		log.Fatalf("init firestore: %v", err)
	}
	defer fs.Close()

	rooms := handlers.NewRoomHandler(fs)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) {
		handlers.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/rooms", rooms.List)
	mux.HandleFunc("POST /api/rooms", rooms.Create)
	mux.HandleFunc("POST /api/rooms/{id}/assign", rooms.Assign)

	addr := os.Getenv("PORT")
	if addr == "" {
		addr = ":8080"
	} else if !strings.HasPrefix(addr, ":") {
		addr = ":" + addr
	}

	log.Printf("Mini-Kouventa API listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, withCORS(mux)))
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", allowedOrigin)
		h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Content-Type")
		h.Set("Vary", "Origin")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
