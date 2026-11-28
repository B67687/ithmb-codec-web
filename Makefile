# Task runner — thin wrappers over the package.json scripts.
.PHONY: build test typecheck lint serve check

build:
	bun run build

test:
	bun run test

typecheck:
	bun run typecheck

lint:
	bun run lint:modules && bun run lint:i18n

serve:
	bun run serve

check:
	bun run check:local
