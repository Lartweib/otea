#!/bin/bash
# The deb's postrm: takes the commands off PATH when the package goes (an upgrade puts them back).
case "$1" in
  remove | purge | 0)
    rm -f '/usr/bin/otea' '/usr/bin/otea-desktop'
    ;;
esac
