package main

import "testing"

func TestVersionConstant(t *testing.T) {
	if version == "" {
		t.Fatal("version must not be empty")
	}
}
