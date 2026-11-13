import dns from "node:dns";
import net from "node:net";

// Node races a host's addresses with 250 ms per attempt. On a throttled CPU
// (Render free is 0.1 CPU) that timer fires before the event loop sees the
// finished TCP handshake, so every attempt ends in ETIMEDOUT. IPv4 first keeps
// a host without IPv6 from waiting out the longer attempt.
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamilyAttemptTimeout(5_000);
