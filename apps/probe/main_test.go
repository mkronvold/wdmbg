package main

import "testing"

func TestVersionConstant(t *testing.T) {
	if version == "" {
		t.Fatal("version must not be empty")
	}
}

func TestEnvHelpers(t *testing.T) {
	t.Setenv("WDMBG_TEST_INT", "7")
	if envInt("WDMBG_TEST_INT", 1) != 7 {
		t.Fatal("envInt")
	}
	t.Setenv("WDMBG_TEST_BOOL", "true")
	if !envBool("WDMBG_TEST_BOOL", false) {
		t.Fatal("envBool")
	}
}