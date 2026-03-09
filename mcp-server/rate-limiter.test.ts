import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "./rate-limiter.js";

describe("RateLimiter", () => {
    it("allows requests within capacity", () => {
        const limiter = new RateLimiter(5, 1);
        for (let i = 0; i < 5; i++) {
            expect(limiter.tryConsume()).toBe(true);
        }
    });

    it("rejects requests when capacity exhausted", () => {
        const limiter = new RateLimiter(3, 1);
        limiter.tryConsume();
        limiter.tryConsume();
        limiter.tryConsume();
        expect(limiter.tryConsume()).toBe(false);
    });

    it("refills tokens over time", () => {
        vi.useFakeTimers();
        const limiter = new RateLimiter(5, 5); // 5 tokens/sec refill

        // Exhaust all tokens
        for (let i = 0; i < 5; i++) {
            limiter.tryConsume();
        }
        expect(limiter.tryConsume()).toBe(false);

        // Advance 1 second — should have 5 tokens back
        vi.advanceTimersByTime(1000);
        expect(limiter.tryConsume()).toBe(true);

        vi.useRealTimers();
    });

    it("does not exceed capacity after long idle", () => {
        vi.useFakeTimers();
        const limiter = new RateLimiter(3, 10);

        // Advance 100 seconds — should still cap at 3
        vi.advanceTimersByTime(100_000);

        expect(limiter.tryConsume()).toBe(true);
        expect(limiter.tryConsume()).toBe(true);
        expect(limiter.tryConsume()).toBe(true);
        expect(limiter.tryConsume()).toBe(false);

        vi.useRealTimers();
    });

    it("uses default capacity and rate", () => {
        const limiter = new RateLimiter();
        // Default is 20 capacity
        for (let i = 0; i < 20; i++) {
            expect(limiter.tryConsume()).toBe(true);
        }
        expect(limiter.tryConsume()).toBe(false);
    });

    it("partially refills tokens", () => {
        vi.useFakeTimers();
        const limiter = new RateLimiter(10, 2); // 2 tokens/sec

        // Use 5 tokens
        for (let i = 0; i < 5; i++) limiter.tryConsume();

        // Advance 500ms — should add 1 token
        vi.advanceTimersByTime(500);
        expect(limiter.tryConsume()).toBe(true); // 6th token (5 remaining + 1 refilled)

        vi.useRealTimers();
    });
});
