package serverevents

import (
	"encoding/json"
	"net/http"

	"npm/internal/logger"

	"github.com/jc21/go-sse"
)

var instance *sse.Server

const defaultChannel = "changes"

// Message is how we're going to send the data
type Message struct {
	Lang       string            `json:"lang,omitempty"`
	LangParams map[string]string `json:"lang_params,omitempty"`
	Type       string            `json:"type,omitempty"`
	Affects    string            `json:"affects,omitempty"`
}

// Get will return a sse server
func Get() *sse.Server {
	if instance == nil {
		instance = sse.NewServer(&sse.Options{
			Logger: logger.Get(),
			ChannelNameFunc: func(_ *http.Request) string {
				return defaultChannel // This is the channel for all updates regardless of visibility
			},
		})
	}
	return instance
}

// Shutdown will shutdown the server
func Shutdown() {
	if instance != nil {
		instance.Shutdown()
	}
}

// SendChange will send a specific change
func SendChange(affects string) {
	Send(Message{Affects: affects}, "")
}

// SendMessage will construct a message for the UI
func SendMessage(typ, lang string, langParams map[string]string) {
	Send(Message{
		Type:       typ,
		Lang:       lang,
		LangParams: langParams,
	}, "")
}

// Send will send a message
func Send(msg Message, channel string) {
	if channel == "" {
		channel = defaultChannel
	}
	logger.Debug("SSE Sending: %+v", msg)
	if data, err := json.Marshal(msg); err != nil {
		logger.Error("SSEError", err)
	} else {
		Get().SendMessage(channel, sse.SimpleMessage(string(data)))
	}
}

// TODO: if we end up implementing user visibility,
// then we'll have to subscribe people to their own
// channels and publish to all or some depending on visibility.
// This means using a specific ChannelNameFunc that revolves
// around the user and their visibility.
