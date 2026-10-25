# Compute to wellbeing

**https://snthibaud.github.io/compute-wellby/**

A scenario explorer that follows AI compute through automation, jobs and incomes to life satisfaction, measured in WELLBYs, for the world economy from 2026 to 2060. It answers named questions that compare two scenarios (or two you set), shows which assumptions the spread of outcomes depends on, and checks the model against published forecasts by economists and AI researchers. It does not rank policies or recommend any.

The engine follows the structure of Epoch AI's [GATE](https://arxiv.org/abs/2503.04941) model but does not fully adhere to it. For example, GATE chooses investment with a forward-looking social planner; here investment follows a fixed rule, so it does not anticipate automation before it happens.

This repository holds only the built page. The engine is a Haskell library compiled to WebAssembly (`engine/engine.wasm`) and runs entirely in the browser; its source is kept private.

A personal project by Stéphane Thibaud. It is not affiliated with or endorsed by Epoch AI.

## How this was made

Built with Claude Code, Anthropic's AI coding assistant, directed by Stéphane Thibaud. He chose the question, the neutral framing and the scenario design, and reviewed the model and its sources. The code and much of the parameter research were written with the assistant. Every assumption links to its source on the page's Method tab, so it can be checked.
