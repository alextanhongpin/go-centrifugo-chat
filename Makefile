-include .env
export

up:
	@docker-compose up -d

down:
	@docker-compose down

server:
	@go run main.go

client:
	@python3 -m http.server 5000
