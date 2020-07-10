package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/centrifugal/gocent"
	"github.com/dgrijalva/jwt-go"
)

type Credential struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

var users map[Credential]int

func init() {
	users = make(map[Credential]int)
	users[Credential{Email: "john.doe@mail.com", Password: "12345678"}] = 1
	users[Credential{Email: "alice@mail.com", Password: "12345678"}] = 2
}

func newClient() *gocent.Client {
	return gocent.New(gocent.Config{
		Addr: "http://localhost:9000",
		Key:  os.Getenv("CENTRIFUGO_API_KEY"),
	})
}

func main() {
	client := newClient()

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"ok": true}`)
	})
	secret := []byte(os.Getenv("CENTRIFUGO_JWT_SECRET"))

	mux.HandleFunc("/register", newRegister(secret))
	mux.HandleFunc("/subscribe", newSubscribe(secret))
	mux.HandleFunc("/publish", newPublish(client))

	log.Println("listening to server on *:8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}

func newRegister(secret []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		setupResponse(&w, r)
		if r.Method == "OPTIONS" {
			return
		}

		var credential Credential
		if err := json.NewDecoder(r.Body).Decode(&credential); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		claims := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": fmt.Sprint(users[credential]),
		})

		// Sign and get the complete encoded token as a string using the secret
		token, err := claims.SignedString(secret)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		js, err := json.Marshal(map[string]interface{}{
			"accessToken": token,
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write(js)
	}
}

func newSubscribe(secret []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		setupResponse(&w, r)
		if r.Method == "OPTIONS" {
			return
		}

		type Subscription struct {
			Client   string   `json:"client"`
			Channels []string `json:"channels"`
		}
		var sub Subscription
		if err := json.NewDecoder(r.Body).Decode(&sub); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		type Channel struct {
			Channel string `json:"channel"`
			Token   string `json:"token"`
		}
		type Response struct {
			Channels []Channel `json:"channels"`
		}

		var result Response
		for i := range sub.Channels {
			client, channel := sub.Client, sub.Channels[i]
			claims := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
				"client":  client,
				"channel": channel,
			})

			// Sign and get the complete encoded token as a string using the secret
			token, err := claims.SignedString(secret)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			result.Channels = append(result.Channels, Channel{
				Channel: channel,
				Token:   token,
			})
		}

		js, err := json.Marshal(result)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write(js)
	}
}

func newPublish(client *gocent.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		setupResponse(&w, r)
		if r.Method == "OPTIONS" {
			return
		}

		type Request struct {
			Credential Credential
			Data       string `json:"data"`
			Channel    string `json:"channel"`
		}
		var req Request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if err := client.Publish(r.Context(), req.Channel, []byte(req.Data)); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		js, err := json.Marshal(map[string]interface{}{
			"ok": true,
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write(js)
	}
}

func setupResponse(w *http.ResponseWriter, req *http.Request) {
	(*w).Header().Set("Access-Control-Allow-Origin", "http://localhost:5000")
	(*w).Header().Set("Access-Control-Allow-Credentials", "true")
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	(*w).Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, x-requested-with")
}
