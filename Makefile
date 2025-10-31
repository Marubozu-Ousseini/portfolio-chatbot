SHELL := /bin/bash

.PHONY: setup package plan apply deploy sync-widget

setup:
	cd lambda && if [ -f package-lock.json ]; then npm ci; else npm install; fi

package:
	cd lambda && zip -q -r function.zip index.js simple-rag.js package.json node_modules

plan:
	cd infrastructure && terraform init && terraform plan -out=tfplan.bin

apply:
	cd infrastructure && terraform apply tfplan.bin

deploy:
	./deploy.sh --yes

sync-widget:
	@if [ -d "../static-portfolio-website/widget" ]; then \
	  cd "../static-portfolio-website/widget" && bash sync-widget.sh; \
	elif [ -d "../static Portfolio website/widget" ]; then \
	  cd "../static Portfolio website/widget" && bash sync-widget.sh; \
	else \
	  echo "Static site folder not found. Expected '../static-portfolio-website' or '../static Portfolio website'"; exit 1; \
	fi
