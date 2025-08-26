# Use the official Rust image as the base
FROM rust:1.75 as builder

# Set the working directory
WORKDIR /app

# Copy the Cargo files
COPY Cargo.toml Cargo.lock ./

# Copy the source code
COPY api ./api

# Build the application in release mode
RUN cargo build --release

# Use a minimal image for the runtime
FROM debian:bookworm-slim

# Install required system dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -r -s /bin/false app-user

# Set the working directory
WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/target/release/fantasy-pl-vercel-proxy-rs .

# Change ownership to the non-root user
RUN chown app-user:app-user fantasy-pl-vercel-proxy-rs

# Switch to the non-root user
USER app-user

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables
ENV RUST_LOG=info
ENV PORT=3000

# Run the application
CMD ["./fantasy-pl-vercel-proxy-rs"]
