// Package ftai implements authenticated FTAI runtime and authority requests.
// The caller retains key custody and is responsible for enrollment and execution controls.
package ftai

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	base, code string
	key        ed25519.PrivateKey
	http       *http.Client
}

func New(base, code string, key ed25519.PrivateKey) (*Client, error) {
	u, e := url.Parse(base)
	if e != nil {
		return nil, e
	}
	if (u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1"))) || u.Host == "" || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" || u.User != nil || len(key) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("valid HTTPS origin and Ed25519 private key required")
	}
	return &Client{strings.TrimRight(base, "/"), code, append(ed25519.PrivateKey(nil), key...), &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return fmt.Errorf("signed requests cannot redirect") }}}, nil
}
func (c *Client) Request(ctx context.Context, method, path string, value any) (json.RawMessage, error) {
	if !strings.HasPrefix(path, "/api/v1/") || strings.ContainsAny(path, "?#") || strings.Contains(path, "..") {
		return nil, fmt.Errorf("invalid API path")
	}
	var body []byte
	var err error
	if method != "GET" {
		if value == nil {
			value = map[string]any{}
		}
		body, err = json.Marshal(value)
		if err != nil {
			return nil, err
		}
	}
	nonce := make([]byte, 16)
	if _, err = rand.Read(nonce); err != nil {
		return nil, err
	}
	nonce[6] = (nonce[6] & 15) | 64
	nonce[8] = (nonce[8] & 63) | 128
	id := fmt.Sprintf("%x-%x-%x-%x-%x", nonce[:4], nonce[4:6], nonce[6:8], nonce[8:10], nonce[10:])
	timestamp := fmt.Sprint(time.Now().Unix())
	hash := sha256.Sum256(body)
	message := strings.Join([]string{"FTAI-Request-v1", c.base, c.code, method, path, timestamp, id, hex.EncodeToString(hash[:])}, "\n")
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-FTAI-Agent", c.code)
	req.Header.Set("X-FTAI-Timestamp", timestamp)
	req.Header.Set("X-FTAI-Nonce", id)
	req.Header.Set("X-FTAI-Signature", base64.RawURLEncoding.EncodeToString(ed25519.Sign(c.key, []byte(message))))
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 2000001))
	if err != nil {
		return nil, err
	}
	if len(data) > 2000000 {
		return nil, fmt.Errorf("response exceeds limit")
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("FTAI HTTP %d: %.4096s", res.StatusCode, data)
	}
	if !json.Valid(data) {
		return nil, fmt.Errorf("invalid JSON response")
	}
	return data, nil
}
func (c *Client) Me(ctx context.Context) (json.RawMessage, error) {
	return c.Request(ctx, "GET", "/api/v1/runtime/me", nil)
}
func (c *Client) CheckAuthority(ctx context.Context, grant string, request any) (json.RawMessage, error) {
	return c.Request(ctx, "POST", "/api/v1/organisations/authorize", map[string]any{"grant": grant, "request": request})
}
func (c *Client) Delegate(ctx context.Context, parent, subject string, constraints any, expires string) (json.RawMessage, error) {
	return c.Request(ctx, "POST", "/api/v1/organisations/delegate", map[string]any{"parent": parent, "subject": subject, "constraints": constraints, "expires": expires})
}
func (c *Client) RequestApproval(ctx context.Context, grant string, request any, inputHash string) (json.RawMessage, error) {
	return c.Request(ctx, "POST", "/api/v1/organisations/approval-request", map[string]any{"grant": grant, "request": request, "inputHash": inputHash})
}
func (c *Client) ConsumeApproval(ctx context.Context, approval, grant string, request any, inputHash string) (json.RawMessage, error) {
	return c.Request(ctx, "POST", "/api/v1/organisations/approval-consume", map[string]any{"approval": approval, "grant": grant, "request": request, "inputHash": inputHash})
}
