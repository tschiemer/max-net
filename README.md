# max-net
UDP/TCP Networking for Max/MSP 8+ (nodejs)

As the original `udpsend` and `udpreceive` objects do NOT send actual raw data but require conformity to the OSC standard this nodejs based interface can be used alternatively.

Additional to UDP-listening/-sending a TCP-Client/Server interface is implemented.

Transmission of binary data supported aswell using hex or base64 encoding.
