# Makefile for Docker commands

.PHONY: help build up down logs restart clean dev prod

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Production commands
build: ## Build production images
	docker-compose build

up: ## Start production containers
	docker-compose up -d

down: ## Stop production containers
	docker-compose down

logs: ## Show production logs
	docker-compose logs -f

restart: ## Restart production containers
	docker-compose restart

# Development commands
dev-build: ## Build development images
	docker-compose -f docker-compose.dev.yml build

dev-up: ## Start development containers
	docker-compose -f docker-compose.dev.yml up -d

dev-down: ## Stop development containers
	docker-compose -f docker-compose.dev.yml down

dev-logs: ## Show development logs
	docker-compose -f docker-compose.dev.yml logs -f

dev-restart: ## Restart development containers
	docker-compose -f docker-compose.dev.yml restart

# Utility commands
clean: ## Remove containers, networks, and volumes
	docker-compose down -v
	docker-compose -f docker-compose.dev.yml down -v

clean-all: clean ## Remove everything including images
	docker-compose down -v --rmi all
	docker-compose -f docker-compose.dev.yml down -v --rmi all

ps: ## Show container status
	docker-compose ps
	docker-compose -f docker-compose.dev.yml ps

# Quick start
prod: build up ## Build and start production
	@echo "Production services started!"
	@echo "Frontend: http://localhost"
	@echo "Backend: http://localhost:3000"

dev: dev-build dev-up ## Build and start development
	@echo "Development services started!"
	@echo "Frontend: http://localhost:5173"
	@echo "Backend: http://localhost:3000"

